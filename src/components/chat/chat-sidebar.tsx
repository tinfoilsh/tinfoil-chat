import { AiOutlineCloudSync, FaLock } from '@/components/icons/lazy-icons'
import { API_BASE_URL, PAGINATION } from '@/config'
import { isCloudSyncEnabled } from '@/utils/cloud-sync-settings'
import { SignInButton, UserButton, useAuth, useUser } from '@clerk/nextjs'
import {
  ArrowDownTrayIcon,
  Bars3Icon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { motion } from 'framer-motion'
import { CONSTANTS } from './constants'

import { cn } from '@/components/ui/utils'
import { r2Storage } from '@/services/cloud/r2-storage'
// Cloud pagination handled via hook; no direct cloudSync usage here
import { useCloudPagination } from '@/hooks/use-cloud-pagination'
import { type StoredChat } from '@/services/storage/indexed-db'
import { getConversationTimestampFromId } from '@/utils/chat-timestamps'
import { logError } from '@/utils/error-handling'
import { KeyIcon } from '@heroicons/react/24/outline'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '../link'
import { Logo } from '../logo'
import type { Chat } from './types'

// Utility function to detect iOS devices
function isIOSDevice() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

// Pagination state is managed by useCloudPagination

// Utility function to format relative timestamps
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) {
    return `${seconds}s ago`
  }

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m ago`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }

  const days = Math.floor(hours / 24)
  if (days < 7) {
    return `${days}d ago`
  }

  const weeks = Math.floor(days / 7)
  if (weeks < 4) {
    return `${weeks}w ago`
  }

  const months = Math.floor(days / 30)
  if (months < 12) {
    return `${months}mo ago`
  }

  const years = Math.floor(days / 365)
  return `${years}y ago`
}

type ChatSidebarProps = {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  chats: Chat[]
  currentChat: Chat
  isDarkMode: boolean
  createNewChat: (intendedLocalOnly?: boolean) => void
  handleChatSelect: (chatId: string) => void
  updateChatTitle: (chatId: string, newTitle: string) => void
  deleteChat: (chatId: string) => void
  isClient: boolean
  isPremium?: boolean
  onEncryptionKeyClick?: () => void
  onChatsUpdated?: () => void
  verificationComplete?: boolean
  verificationSuccess?: boolean
  onVerificationComplete?: (success: boolean) => void
  onVerificationUpdate?: (state: any) => void
}

// Add this constant at the top of the file
const MOBILE_BREAKPOINT = 1024 // Same as in chat-interface.tsx

// Function to download all chats as markdown files in a zip
async function downloadChats(chats: Chat[]) {
  if (chats.length === 0) return

  // Create markdown content for each chat
  const chatFiles: { [filename: string]: string } = {}

  chats.forEach((chat, index) => {
    const date = new Date(chat.createdAt).toISOString().split('T')[0]
    const sanitizedTitle = chat.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()
    const filename = `${date}_${sanitizedTitle || `chat_${index + 1}`}.md`

    let markdown = `# ${chat.title}\n\n`
    markdown += `**Created:** ${new Date(chat.createdAt).toLocaleString()}\n`
    markdown += `**Messages:** ${chat.messages.length}\n\n---\n\n`

    chat.messages.forEach((message) => {
      const timestamp = new Date(message.timestamp).toLocaleString()
      const role = message.role === 'user' ? 'User' : 'Assistant'

      markdown += `## ${role}\n`
      markdown += `*${timestamp}*\n\n`
      markdown += `${message.content}\n\n---\n\n`
    })

    chatFiles[filename] = markdown
  })

  // Create and download zip file
  try {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()

    // Add each chat file to the zip
    Object.entries(chatFiles).forEach(([filename, content]) => {
      zip.file(filename, content)
    })

    // Add a summary file
    const summary =
      `# Chat Export Summary\n\n` +
      `**Export Date:** ${new Date().toLocaleString()}\n` +
      `**Total Chats:** ${chats.length}\n` +
      `**Total Messages:** ${chats.reduce((sum, chat) => sum + chat.messages.length, 0)}\n\n` +
      `## Chat List\n\n` +
      chats
        .map(
          (chat, index) =>
            `${index + 1}. **${chat.title}** (${chat.messages.length} messages) - ${new Date(chat.createdAt).toLocaleDateString()}`,
        )
        .join('\n')

    zip.file('_chat_summary.md', summary)

    // Generate and download the zip
    zip.generateAsync({ type: 'blob' }).then((content) => {
      const url = window.URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `tinfoil_chat_export_${new Date().toISOString().split('T')[0]}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    })
  } catch (error) {
    logError('Failed to create chat export zip file', error, {
      component: 'ChatSidebar',
      action: 'downloadChats',
    })
    alert('Failed to download chats. Please try again.')
  }
}

// Add this useEffect function to prevent zooming on mobile Safari
function usePreventZoom() {
  useEffect(() => {
    // Set viewport meta tag to prevent zooming
    const viewportMeta = document.createElement('meta')
    viewportMeta.name = 'viewport'
    viewportMeta.content =
      'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'
    document.head.appendChild(viewportMeta)

    return () => {
      // Only remove if the meta tag exists and is a child of document.head
      if (viewportMeta.parentNode === document.head) {
        document.head.removeChild(viewportMeta)
      }
    }
  }, [])
}

export function ChatSidebar({
  isOpen,
  setIsOpen,
  chats,
  currentChat,
  isDarkMode,
  createNewChat,
  handleChatSelect,
  updateChatTitle,
  deleteChat,
  isClient,
  isPremium = true,
  onEncryptionKeyClick,
  onChatsUpdated,
}: ChatSidebarProps) {
  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 0,
  )
  const [isIOS, setIsIOS] = useState(false)
  const [highlightBox, setHighlightBox] = useState<'signin' | 'premium' | null>(
    null,
  )
  const [upgradeLoading, setUpgradeLoading] = useState(false)
  const [upgradeError, setUpgradeError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'cloud' | 'local'>('cloud')
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(isCloudSyncEnabled())
  const { isSignedIn, getToken } = useAuth()
  const { user } = useUser()
  // Cloud pagination state via hook
  const {
    hasMore: hasMoreRemote,
    isLoading: isLoadingMore,
    hasAttempted: hasAttemptedLoadMore,
    initialize: initPagination,
    loadMore: loadMorePage,
    reset: resetPagination,
  } = useCloudPagination({
    isSignedIn: !!isSignedIn,
    userId: user?.id,
  })
  const previousChatCount = useRef(chats.length)
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Token getter should be set by parent component that has access to getApiKey
  // The parent (ChatInterface) already sets this up through useCloudSync

  // Apply zoom prevention for mobile
  usePreventZoom()

  // Listen for cloud sync setting changes
  useEffect(() => {
    const handleCloudSyncChange = () => {
      setCloudSyncEnabled(isCloudSyncEnabled())
    }

    // Listen for both storage events and custom events
    window.addEventListener('storage', handleCloudSyncChange)
    window.addEventListener('cloudSyncSettingChanged', handleCloudSyncChange)

    return () => {
      window.removeEventListener('storage', handleCloudSyncChange)
      window.removeEventListener(
        'cloudSyncSettingChanged',
        handleCloudSyncChange,
      )
    }
  }, [])

  // Update blank chat's intendedLocalOnly when active tab changes
  useEffect(() => {
    if (!isSignedIn || !cloudSyncEnabled) return

    const shouldBeLocal = activeTab === 'local'
    const blankChat = chats.find((chat) => chat.isBlankChat === true)

    // If there's a blank chat and its intendedLocalOnly doesn't match the active tab,
    // call createNewChat to update it
    if (blankChat && blankChat.intendedLocalOnly !== shouldBeLocal) {
      createNewChat(shouldBeLocal)
    }
  }, [activeTab, isSignedIn, cloudSyncEnabled, chats, createNewChat])

  // Listen for highlight events
  useEffect(() => {
    const handleHighlightEvent = (event: CustomEvent) => {
      const { isPremium: userIsPremium } = event.detail
      // Determine which box to highlight based on user state
      if (!isSignedIn) {
        setHighlightBox('signin')
      } else if (!userIsPremium) {
        setHighlightBox('premium')
      }

      // Clear any existing timeout to prevent race conditions
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current)
      }

      // Clear highlight after 2 pulses (2.4 seconds total)
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightBox(null)
        highlightTimeoutRef.current = null
      }, 2400)
    }

    window.addEventListener(
      'highlightSidebarBox',
      handleHighlightEvent as EventListener,
    )
    return () => {
      window.removeEventListener(
        'highlightSidebarBox',
        handleHighlightEvent as EventListener,
      )
      // Clear timeout on cleanup
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current)
      }
    }
  }, [isSignedIn])

  // Calculate if we should show the Load More button
  const syncedChatsCount = chats.filter((chat) => chat.syncedAt).length
  // Show load more if:
  // 1. User is signed in
  // 2. On cloud tab
  // 3. Either: we have more remote chats, OR we haven't tried loading yet and have enough chats to suggest pagination
  const shouldShowLoadMore =
    isSignedIn &&
    activeTab === 'cloud' &&
    (hasMoreRemote ||
      (!hasAttemptedLoadMore && syncedChatsCount >= PAGINATION.CHATS_PER_PAGE))

  // Add window resize listener and iOS detection
  useEffect(() => {
    if (isClient) {
      const handleResize = () => {
        setWindowWidth(window.innerWidth)
      }

      // Detect iOS device
      setIsIOS(isIOSDevice())

      window.addEventListener('resize', handleResize)
      return () => {
        window.removeEventListener('resize', handleResize)
      }
    }
  }, [isClient])

  // Remove initial load state after mount
  useEffect(() => {
    setIsInitialLoad(false)
  }, [])

  // Initialize r2Storage with token getter when component mounts
  useEffect(() => {
    if (isSignedIn && getToken) {
      // Set up token getter for r2Storage using Clerk token
      r2Storage.setTokenGetter(async () => {
        const token = await getToken()
        return token
      })
    }
  }, [isSignedIn, getToken])

  // Pagination initialization handled by hook/useEffect below

  // Track if we just loaded more chats via pagination
  const justLoadedMoreRef = useRef(false)

  // Reset pagination when new chats are added (but not when loading more via pagination)
  useEffect(() => {
    // Detect if a new chat was added (chat count increased)
    if (
      isSignedIn &&
      chats.length > previousChatCount.current &&
      previousChatCount.current > 0 // Not the initial load
    ) {
      // Check if this was from pagination or a new chat
      if (justLoadedMoreRef.current) {
        // This was from pagination, don't reset
        justLoadedMoreRef.current = false
      } else {
        resetPagination()
          .then((result) => {
            if (result?.deletedIds.length && onChatsUpdated) {
              onChatsUpdated()
            }
          })
          .catch((error) => {
            logError('Failed to reset pagination after new chat', error, {
              component: 'ChatSidebar',
              action: 'resetPaginationAfterNewChat',
            })
          })
      }
    }

    // Update the previous count for next comparison
    previousChatCount.current = chats.length
  }, [chats.length, isSignedIn, onChatsUpdated, resetPagination])

  // Initialize pagination state on page refresh
  useEffect(() => {
    const cleanupAndInitialize = async () => {
      if (!isSignedIn || !user?.id) return

      try {
        const result = await initPagination()
        if (result?.deletedIds.length && onChatsUpdated) {
          onChatsUpdated()
        }
      } catch (error) {
        logError('Failed to cleanup and initialize pagination', error, {
          component: 'ChatSidebar',
          action: 'cleanupAndInitialize',
        })
      }
    }

    cleanupAndInitialize()
  }, [isSignedIn, user?.id, onChatsUpdated, initPagination])

  // Load more chats from backend (delegated to CloudSync via hook)
  const loadMoreChats = async () => {
    try {
      if (isLoadingMore || !isSignedIn) return
      const result = await loadMorePage()
      const savedCount = result?.saved ?? 0
      justLoadedMoreRef.current = savedCount > 0
      if (savedCount > 0 && onChatsUpdated) {
        onChatsUpdated()
      }
    } catch (error) {
      justLoadedMoreRef.current = false
      logError('Failed to load more chats', error, {
        component: 'ChatSidebar',
        action: 'loadMoreChats',
      })
    }
  }

  // Instead of trying to detect Safari, let's use CSS custom properties
  // that will apply the padding only when needed
  useEffect(() => {
    if (isClient) {
      // Add CSS variables to root to handle Safari bottom bar
      document.documentElement.style.setProperty(
        '--safe-area-inset-bottom',
        'env(safe-area-inset-bottom, 0px)',
      )
    }
  }, [isClient])

  const getChatSortTimestamp = useCallback((chat: Chat) => {
    const createdValue =
      chat.createdAt instanceof Date
        ? chat.createdAt.getTime()
        : new Date(chat.createdAt).getTime()

    if (!Number.isNaN(createdValue)) {
      return createdValue
    }

    const storedChat = chat as unknown as StoredChat
    const candidateTimes: Array<number | undefined> = [
      typeof storedChat.syncedAt === 'number' ? storedChat.syncedAt : undefined,
      storedChat.updatedAt
        ? new Date(storedChat.updatedAt).getTime()
        : undefined,
      storedChat.loadedAt,
    ]

    for (const candidate of candidateTimes) {
      if (typeof candidate === 'number' && !Number.isNaN(candidate)) {
        return candidate
      }
    }

    return getConversationTimestampFromId(chat.id) ?? 0
  }, [])

  const sortedChats = useMemo(() => {
    // Filter chats based on active tab (only when cloud sync is enabled)
    const filteredChats =
      isSignedIn && cloudSyncEnabled
        ? activeTab === 'cloud'
          ? chats.filter((chat) => {
              // For blank chats, use intendedLocalOnly flag since they haven't been saved yet
              if (chat.isBlankChat) {
                return !(chat as any).intendedLocalOnly
              }
              return !(chat as any).isLocalOnly
            })
          : chats.filter((chat) => {
              // For blank chats, use intendedLocalOnly flag since they haven't been saved yet
              if (chat.isBlankChat) {
                return (chat as any).intendedLocalOnly
              }
              return (chat as any).isLocalOnly
            })
        : chats // Show all chats when not signed in or cloud sync is disabled

    return [...filteredChats].sort((a, b) => {
      // Blank chats should always be at the top
      const aIsBlank = a.isBlankChat === true
      const bIsBlank = b.isBlankChat === true

      if (aIsBlank && !bIsBlank) return -1
      if (!aIsBlank && bIsBlank) return 1

      const timeA = getChatSortTimestamp(a)
      const timeB = getChatSortTimestamp(b)
      return timeB - timeA
    })
  }, [chats, getChatSortTimestamp, activeTab, isSignedIn, cloudSyncEnabled])

  const handleUpgradeToPro = useCallback(async () => {
    if (!getToken) {
      return
    }

    setUpgradeError(null)
    setUpgradeLoading(true)
    try {
      const token = await getToken()
      if (!token) {
        throw new Error('No authentication token available')
      }

      const returnUrl = encodeURIComponent(window.location.origin)
      const response = await fetch(
        `${API_BASE_URL}/api/billing/chat-checkout-link?returnUrl=${returnUrl}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      )

      if (!response.ok) {
        throw new Error('Failed to generate checkout link')
      }

      const data = await response.json()
      if (!data?.url) {
        throw new Error('Checkout link unavailable')
      }

      window.location.href = data.url as string
    } catch (error) {
      setUpgradeError('Failed to start checkout. Please try again later.')
    } finally {
      setUpgradeLoading(false)
    }
  }, [getToken])

  return (
    <>
      {/* CSS for subtle pulse animation */}
      <style jsx global>{`
        @keyframes subtlePulse {
          0% {
            opacity: 1;
          }
          50% {
            opacity: 0.88;
          }
          100% {
            opacity: 1;
          }
        }
      `}</style>

      {/* Sidebar wrapper */}
      <div
        className={cn(
          'fixed z-40 flex h-dvh w-[85vw] flex-col overflow-hidden border-r',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'border-border-subtle bg-surface-sidebar text-content-primary',
          isInitialLoad ? '' : 'transition-all duration-200 ease-in-out',
        )}
        style={{ maxWidth: `${CONSTANTS.CHAT_SIDEBAR_WIDTH_PX}px` }}
      >
        {/* Header */}
        <div className="flex h-16 flex-none items-center justify-between border-b border-border-subtle p-4">
          <Link
            href="https://www.tinfoil.sh"
            title="Home"
            className="flex items-center"
          >
            <Logo className="mt-1 h-6 w-auto" dark={isDarkMode} />
          </Link>
          <div className="flex items-center gap-3">
            {/* User button for signed-in users */}
            {isSignedIn && (
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: 'w-8 h-8',
                  },
                }}
              />
            )}
            <button
              className="hidden items-center justify-center rounded-lg border border-border-subtle bg-surface-chat p-2 text-content-primary transition-all duration-200 hover:bg-surface-chat/80 md:flex"
              onClick={() => setIsOpen(!isOpen)}
            >
              {isOpen ? (
                <XMarkIcon className="h-5 w-5" />
              ) : (
                <Bars3Icon className="h-5 w-5" />
              )}
            </button>
            <button
              className="rounded-lg border border-border-subtle bg-surface-chat p-2 text-content-primary transition-all duration-200 hover:bg-surface-chat/80 md:hidden"
              onClick={() => setIsOpen(false)}
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Main sidebar content */}
        <div className="flex h-full flex-col overflow-hidden">
          {/* Message for non-signed-in users */}
          {!isSignedIn && (
            <div
              className={`m-2 flex-none rounded-lg border p-4 transition-all duration-300 ${
                highlightBox === 'signin'
                  ? isDarkMode
                    ? 'border-emerald-400/50 bg-emerald-900/30'
                    : 'border-emerald-500/50 bg-emerald-100/60'
                  : isDarkMode
                    ? 'border-emerald-500/30 bg-emerald-950/20'
                    : 'border-emerald-500/30 bg-emerald-50/50'
              }`}
              style={{
                animation:
                  highlightBox === 'signin'
                    ? 'subtlePulse 1.2s ease-in-out infinite'
                    : undefined,
              }}
            >
              <h4 className="mb-1 text-sm font-semibold text-content-primary">
                Sign in to unlock full features
              </h4>
              <p className="mb-3 text-sm text-content-secondary">
                Access chat history and sync across devices.
              </p>
              <SignInButton mode="modal">
                <button className="w-full rounded-md bg-brand-accent-dark px-4 py-2 text-sm font-medium text-white transition-all hover:bg-brand-accent-dark/90">
                  Sign in
                </button>
              </SignInButton>
            </div>
          )}

          {/* Message for signed-in non-premium users */}
          {isSignedIn && !isPremium && (
            <div
              className={`m-2 flex-none rounded-lg border p-4 transition-all duration-300 ${
                highlightBox === 'premium'
                  ? isDarkMode
                    ? 'border-emerald-400/50 bg-emerald-900/30'
                    : 'border-emerald-500/50 bg-emerald-100/60'
                  : isDarkMode
                    ? 'border-emerald-500/30 bg-emerald-950/20'
                    : 'border-emerald-500/30 bg-emerald-50/50'
              }`}
              style={{
                animation:
                  highlightBox === 'premium'
                    ? 'subtlePulse 1.2s ease-in-out infinite'
                    : undefined,
              }}
            >
              <div className="flex-1">
                <h4 className="mb-3 text-sm font-semibold text-content-primary">
                  Get more out of Tinfoil Chat
                </h4>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3 text-xs text-content-secondary">
                    <svg
                      className="h-4 w-4 flex-shrink-0 text-content-muted"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                      />
                    </svg>
                    <span>Speech-to-text voice input</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-content-secondary">
                    <svg
                      className="h-4 w-4 flex-shrink-0 text-content-muted"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                      />
                    </svg>
                    <span>Premium AI models</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-content-secondary">
                    <svg
                      className="h-4 w-4 flex-shrink-0 text-content-muted"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    <span>Faster response times</span>
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      void handleUpgradeToPro()
                    }}
                    disabled={upgradeLoading}
                    className={`inline-flex items-center gap-1 text-sm font-medium transition-colors ${
                      isDarkMode
                        ? 'text-emerald-400 hover:text-emerald-300'
                        : 'text-emerald-600 hover:text-emerald-500'
                    } ${upgradeLoading ? 'cursor-not-allowed opacity-70' : ''}`}
                  >
                    {upgradeLoading ? 'Redirecting…' : 'Upgrade to Pro'}
                    {!upgradeLoading && (
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    )}
                  </button>
                  {upgradeError && (
                    <p className="mt-2 text-xs text-destructive">
                      {upgradeError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Divider after boxes */}
          {(!isSignedIn || (isSignedIn && !isPremium)) && (
            <div className="border-b border-border-subtle" />
          )}

          {/* New Chat button */}
          <div className="flex-none">
            <button
              onClick={() => {
                // Create local-only chat if on local tab, cloud chat otherwise
                const shouldBeLocal =
                  isSignedIn && cloudSyncEnabled && activeTab === 'local'
                createNewChat(shouldBeLocal)
                // Only close sidebar on mobile
                if (windowWidth < MOBILE_BREAKPOINT) {
                  setIsOpen(false)
                }
              }}
              className={`m-2 flex items-center gap-2 rounded-lg border p-3 text-sm ${
                currentChat?.messages?.length === 0
                  ? isDarkMode
                    ? 'cursor-not-allowed border-border-strong text-content-muted opacity-50'
                    : 'cursor-not-allowed border-border-subtle text-content-muted opacity-50'
                  : isDarkMode
                    ? 'border-border-strong text-content-secondary hover:border-border-strong/80 hover:bg-surface-chat'
                    : 'border-border-subtle text-content-secondary hover:border-border-strong hover:bg-surface-sidebar'
              }`}
              disabled={currentChat?.messages?.length === 0}
            >
              <PlusIcon className="h-5 w-5" />
              New chat
            </button>
          </div>

          {/* Chat History Header */}
          <div className="flex-none border-b border-border-subtle px-3 py-2 sm:px-4 sm:py-3">
            <div className="flex items-center justify-between">
              <h3 className="truncate font-aeonik-fono text-sm font-medium text-content-primary">
                Chat History
              </h3>
              <div className="flex items-center gap-1">
                {onEncryptionKeyClick && isSignedIn && (
                  <button
                    onClick={onEncryptionKeyClick}
                    className={`rounded-lg p-1.5 transition-all duration-200 ${
                      isDarkMode
                        ? 'text-content-muted hover:bg-surface-chat hover:text-content-secondary'
                        : 'text-content-muted hover:bg-surface-sidebar hover:text-content-secondary'
                    }`}
                    title="Manage encryption key"
                  >
                    <KeyIcon className="h-4 w-4" />
                  </button>
                )}
                {chats.length > 0 && (
                  <button
                    onClick={() => downloadChats(chats)}
                    className={`rounded-lg p-1.5 transition-all duration-200 ${
                      isDarkMode
                        ? 'text-content-muted hover:bg-surface-chat hover:text-content-secondary'
                        : 'text-content-muted hover:bg-surface-sidebar hover:text-content-secondary'
                    }`}
                    title="Download all chats as ZIP"
                  >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Tabs for Cloud/Local chats - show when signed in and cloud sync is enabled */}
            {isSignedIn && cloudSyncEnabled && (
              <div className="mt-2 flex gap-1 rounded-lg bg-surface-chat/50 p-1">
                <button
                  onClick={() => setActiveTab('cloud')}
                  className={`flex-1 rounded-md px-3 py-1 text-xs font-medium transition-all ${
                    activeTab === 'cloud'
                      ? isDarkMode
                        ? 'bg-surface-chat text-content-primary shadow-sm'
                        : 'bg-white text-content-primary shadow-sm'
                      : 'text-content-muted hover:text-content-secondary'
                  }`}
                >
                  Cloud (
                  {
                    chats.filter((chat) => {
                      if (chat.isBlankChat) {
                        return !(chat as any).intendedLocalOnly
                      }
                      return !(chat as any).isLocalOnly
                    }).length
                  }
                  )
                </button>
                <button
                  onClick={() => setActiveTab('local')}
                  className={`flex-1 rounded-md px-3 py-1 text-xs font-medium transition-all ${
                    activeTab === 'local'
                      ? isDarkMode
                        ? 'bg-surface-chat text-content-primary shadow-sm'
                        : 'bg-white text-content-primary shadow-sm'
                      : 'text-content-muted hover:text-content-secondary'
                  }`}
                >
                  Local (
                  {
                    chats.filter((chat) => {
                      if (chat.isBlankChat) {
                        return (chat as any).intendedLocalOnly
                      }
                      return (chat as any).isLocalOnly
                    }).length
                  }
                  )
                </button>
              </div>
            )}

            <div className="font-base mt-1 font-aeonik-fono text-xs text-content-muted">
              {!isSignedIn ? (
                'Your chats are stored temporarily in this browser tab.'
              ) : activeTab === 'cloud' ? (
                <>
                  Your chats are encrypted and synced to the cloud. The
                  encryption key is only stored on this browser and never sent
                  to Tinfoil.
                </>
              ) : (
                "Local chats are stored only on this device and won't sync."
              )}
            </div>
          </div>

          {/* Scrollable Chat List */}
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-2 p-2">
              {isClient &&
                sortedChats.length === 0 &&
                activeTab === 'local' && (
                  <div className="rounded-lg border border-border-subtle p-4 text-center">
                    <p className="text-sm text-content-muted">
                      No local chats yet
                    </p>
                    <p className="mt-1 text-xs text-content-muted">
                      Disable cloud sync in settings to create local-only chats
                    </p>
                  </div>
                )}
              {isClient &&
                sortedChats.map((chat) => (
                  <div key={chat.id} className="relative">
                    <div
                      onClick={() => {
                        // Open encryption key modal for encrypted chats
                        if (chat.decryptionFailed) {
                          if (onEncryptionKeyClick) {
                            onEncryptionKeyClick()
                          }
                          return
                        }

                        handleChatSelect(chat.id)

                        // Only close sidebar on mobile
                        if (windowWidth < MOBILE_BREAKPOINT) {
                          setIsOpen(false)
                        }
                      }}
                      className={`group flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left text-sm ${
                        chat.decryptionFailed
                          ? onEncryptionKeyClick
                            ? isDarkMode
                              ? 'cursor-pointer border-border-strong hover:border-gray-600 hover:bg-surface-chat'
                              : 'cursor-pointer border-border-subtle hover:border-gray-400 hover:bg-surface-sidebar'
                            : isDarkMode
                              ? 'cursor-not-allowed border-border-strong opacity-60'
                              : 'cursor-not-allowed border-border-subtle opacity-60'
                          : currentChat?.id === chat.id
                            ? isDarkMode
                              ? 'cursor-pointer border-brand-accent-light/60 bg-brand-accent-light/20 text-white'
                              : 'cursor-pointer border-brand-accent-light/60 bg-brand-accent-light/20 text-content-primary'
                            : isDarkMode
                              ? 'cursor-pointer border-border-strong text-content-secondary hover:border-border-strong/80 hover:bg-surface-chat'
                              : 'cursor-pointer border-border-subtle text-content-secondary hover:border-border-strong hover:bg-surface-sidebar'
                      }`}
                    >
                      {/* Chat item content */}
                      <ChatListItem
                        chat={chat}
                        isEditing={editingChatId === chat.id}
                        editingTitle={editingTitle}
                        setEditingTitle={setEditingTitle}
                        updateChatTitle={updateChatTitle}
                        setEditingChatId={setEditingChatId}
                        setDeletingChatId={setDeletingChatId}
                        isPremium={isPremium}
                        isDarkMode={isDarkMode}
                        isSignedIn={isSignedIn ?? false}
                        cloudSyncEnabled={cloudSyncEnabled}
                      />
                    </div>
                    {/* Delete confirmation */}
                    {deletingChatId === chat.id && (
                      <DeleteConfirmation
                        chatId={chat.id}
                        onDelete={deleteChat}
                        onCancel={() => setDeletingChatId(null)}
                        isDarkMode={isDarkMode}
                      />
                    )}
                  </div>
                ))}

              {/* Load More button - only for remote chats */}
              {shouldShowLoadMore && (
                <button
                  onClick={() => loadMoreChats()}
                  disabled={isLoadingMore}
                  className={`w-full rounded-lg border border-border-subtle p-3 text-center text-sm font-medium transition-colors ${
                    isDarkMode
                      ? 'bg-surface-chat text-content-secondary hover:bg-surface-chat/80 disabled:bg-surface-chat disabled:text-content-muted'
                      : 'bg-surface-sidebar text-content-secondary hover:bg-surface-sidebar/80 disabled:bg-surface-sidebar disabled:text-content-muted'
                  }`}
                >
                  {isLoadingMore ? 'Loading...' : 'Load More'}
                </button>
              )}

              {/* Show "No more chats" message when we've loaded everything */}
              {isSignedIn &&
                !shouldShowLoadMore &&
                !hasMoreRemote &&
                hasAttemptedLoadMore && (
                  <div className="w-full rounded-lg p-3 text-center text-sm text-content-muted">
                    No more chats
                  </div>
                )}
            </div>
          </div>

          {/* App Store button for iOS users */}
          {isClient && isIOS && (
            <div className="flex-none border-t border-border-subtle p-3">
              <div className="text-center">
                <p
                  className={`mb-2 text-sm font-medium ${'text-content-secondary'}`}
                >
                  Get the native app
                </p>
                <a
                  href="https://apps.apple.com/app/tinfoil/id6745201750"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full"
                >
                  <img
                    src={
                      isDarkMode ? '/appstore-dark.svg' : '/appstore-light.svg'
                    }
                    alt="Download on the App Store"
                    className="mx-auto h-10 w-auto transition-opacity hover:opacity-80"
                  />
                </a>
              </div>
            </div>
          )}

          {/* Terms and privacy policy */}
          <div className="flex h-[56px] flex-none items-center justify-center border-t border-border-subtle bg-surface-sidebar p-3">
            <p className="text-center text-xs leading-relaxed text-content-secondary">
              By using this service, you agree to Tinfoil&apos;s{' '}
              <Link
                href="https://tinfoil.sh/terms"
                className={
                  isDarkMode
                    ? 'text-white underline hover:text-content-secondary'
                    : 'text-brand-accent-dark underline hover:text-brand-accent-dark/80'
                }
              >
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                href="https://tinfoil.sh/privacy"
                className={
                  isDarkMode
                    ? 'text-white underline hover:text-content-secondary'
                    : 'text-brand-accent-dark underline hover:text-brand-accent-dark/80'
                }
              >
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}

// Typing animation component
function TypingAnimation({
  fromText,
  toText,
  onComplete,
  isDarkMode,
}: {
  fromText: string
  toText: string
  onComplete: () => void
  isDarkMode: boolean
}) {
  const [currentText, setCurrentText] = useState(fromText)
  const [showCursor, setShowCursor] = useState(true)
  const [phase, setPhase] = useState<'deleting' | 'typing'>('deleting')

  useEffect(() => {
    let timeoutId: NodeJS.Timeout
    let completionTimeoutId: NodeJS.Timeout

    // Cursor blinking effect
    const cursorInterval = setInterval(() => {
      setShowCursor((prev) => !prev)
    }, 530)

    if (phase === 'deleting') {
      // Delete characters one by one
      if (currentText.length > 0) {
        timeoutId = setTimeout(
          () => {
            setCurrentText((prev) => prev.slice(0, -1))
          },
          50 + Math.random() * 30,
        ) // Vary speed slightly for realism
      } else {
        // Start typing phase
        setPhase('typing')
      }
    } else if (phase === 'typing') {
      // Type new characters one by one
      if (currentText.length < toText.length) {
        timeoutId = setTimeout(
          () => {
            setCurrentText(toText.slice(0, currentText.length + 1))
          },
          80 + Math.random() * 40,
        ) // Vary speed slightly for realism
      } else {
        // Animation complete
        clearInterval(cursorInterval)
        completionTimeoutId = setTimeout(() => {
          onComplete()
        }, 500) // Show final result for a moment before completing
      }
    }

    return () => {
      clearTimeout(timeoutId)
      clearTimeout(completionTimeoutId)
      clearInterval(cursorInterval)
    }
  }, [currentText, phase, toText, onComplete])

  return (
    <span className="inline-flex items-baseline">
      <span>{currentText}</span>
      <span
        className={`ml-0.5 inline-block w-0.5 bg-content-primary ${showCursor ? 'opacity-100' : 'opacity-0'}`}
        style={{ height: '1.1em', transform: 'translateY(0.05em)' }}
      />
    </span>
  )
}

// Helper components
function ChatListItem({
  chat,
  isEditing,
  editingTitle,
  setEditingTitle,
  updateChatTitle,
  setEditingChatId,
  setDeletingChatId,
  isPremium = true,
  isDarkMode,
  isSignedIn,
  cloudSyncEnabled,
}: {
  chat: Chat
  isEditing: boolean
  editingTitle: string
  setEditingTitle: (title: string) => void
  updateChatTitle: (chatId: string, title: string) => void
  setEditingChatId: (id: string | null) => void
  setDeletingChatId: (id: string | null) => void
  isPremium?: boolean
  isDarkMode: boolean
  isSignedIn: boolean
  cloudSyncEnabled: boolean
}) {
  // Track previous title for animation
  const [displayTitle, setDisplayTitle] = useState(chat.title)
  const [isAnimating, setIsAnimating] = useState(false)
  const [animationFromTitle, setAnimationFromTitle] = useState('')
  const [animationToTitle, setAnimationToTitle] = useState('')
  const prevTitleRef = useRef(chat.title)

  // Animate title changes
  useEffect(() => {
    if (
      prevTitleRef.current !== chat.title &&
      chat.title !== 'New Chat' &&
      prevTitleRef.current !== ''
    ) {
      // Title changed - trigger typing animation
      setAnimationFromTitle(prevTitleRef.current)
      setAnimationToTitle(chat.title)
      setIsAnimating(true)
    } else {
      // Instant update for "New Chat" title or initial load
      setDisplayTitle(chat.title)
      prevTitleRef.current = chat.title
    }
  }, [chat.title])

  const handleAnimationComplete = () => {
    setDisplayTitle(chat.title)
    setIsAnimating(false)
    prevTitleRef.current = chat.title
  }

  // Handle edit form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (editingTitle.trim() && isPremium) {
      updateChatTitle(chat.id, editingTitle)
      setEditingChatId(null)
    }
  }

  // Start editing
  const startEditing = (e: React.MouseEvent) => {
    if (!isPremium) return

    e.stopPropagation()
    setEditingTitle(chat.title)
    setEditingChatId(chat.id)
  }

  // Handle escape key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditingChatId(null)
    }
  }

  return (
    <>
      <div className="flex w-full items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {isEditing && isPremium ? (
            <form
              onSubmit={handleSubmit}
              className="w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                className={`w-full rounded bg-surface-sidebar px-2 py-1 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-blue-500`}
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            </form>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                {/* Lock icon for encrypted chats - moved to the left */}
                {chat.decryptionFailed && (
                  <FaLock
                    className="h-3.5 w-3.5 flex-shrink-0 text-orange-500"
                    title="Encrypted chat"
                  />
                )}
                <div
                  className={`truncate font-aeonik-fono text-sm font-medium ${
                    chat.decryptionFailed
                      ? 'text-orange-500'
                      : isDarkMode
                        ? 'text-content-primary'
                        : 'text-content-primary'
                  }`}
                >
                  {chat.decryptionFailed ? (
                    'Encrypted'
                  ) : isAnimating ? (
                    <TypingAnimation
                      fromText={animationFromTitle}
                      toText={animationToTitle}
                      onComplete={handleAnimationComplete}
                      isDarkMode={isDarkMode}
                    />
                  ) : (
                    displayTitle
                  )}
                </div>
                {/* New chat indicator */}
                {chat.messages.length === 0 && !chat.decryptionFailed && (
                  <div
                    className="h-1.5 w-1.5 rounded-full bg-blue-500"
                    title="New chat"
                  />
                )}
              </div>
              <div className="flex w-full items-center justify-between gap-2">
                {chat.decryptionFailed ? (
                  <div className="text-xs text-red-500">
                    {(chat as any).dataCorrupted
                      ? 'Failed to decrypt: corrupted data'
                      : 'Failed to decrypt: wrong key'}
                  </div>
                ) : chat.messages.length === 0 ? (
                  <>
                    {/* Empty space for timestamp area */}
                    <div className="text-xs text-content-muted">{'\u00A0'}</div>
                    {/* For empty chats, show "local" only if truly local-only */}
                    {(chat as any).isLocalOnly && (
                      <span
                        className="ml-auto rounded bg-content-muted/20 px-1.5 py-px font-aeonik-fono text-[10px] font-medium text-content-muted"
                        title="This chat is stored locally and won't sync to cloud"
                      >
                        local
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-xs text-content-muted">
                      {formatRelativeTime(chat.createdAt)}
                    </div>
                    {/* Show "local" ONLY for truly local-only chats */}
                    {(chat as any).isLocalOnly ? (
                      <span
                        className="ml-auto rounded bg-content-muted/20 px-1.5 py-px font-aeonik-fono text-[10px] font-medium text-content-muted"
                        title="This chat is stored locally and won't sync to cloud"
                      >
                        local
                      </span>
                    ) : !isSignedIn ? null : !cloudSyncEnabled ? ( // Not signed in - show nothing (chats are temporary)
                      // Cloud sync disabled but chat not marked as local-only
                      <span
                        className="ml-auto rounded bg-amber-500/20 px-1.5 py-px font-aeonik-fono text-[10px] font-medium text-amber-600 dark:text-amber-400"
                        title="Cloud sync is disabled - chat won't sync"
                      >
                        unsynced
                      </span>
                    ) : (
                      // Cloud sync enabled, show sync status
                      !chat.syncedAt && (
                        <AiOutlineCloudSync
                          className="ml-auto h-3 w-3 text-content-muted"
                          title="Not synced to cloud"
                        />
                      )
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {!isEditing && (
          <div className="ml-2 flex opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
            {!chat.decryptionFailed && isPremium && (
              <button
                className={`mr-1 rounded p-1 transition-colors ${
                  isDarkMode
                    ? 'text-content-muted hover:bg-surface-chat hover:text-white'
                    : 'text-content-muted hover:bg-surface-sidebar hover:text-content-secondary'
                }`}
                onClick={startEditing}
                title="Rename"
              >
                <PencilSquareIcon className="h-4 w-4" />
              </button>
            )}
            <button
              className={`rounded p-1 transition-colors ${
                isDarkMode
                  ? 'text-content-muted hover:bg-surface-chat hover:text-white'
                  : 'text-content-muted hover:bg-surface-sidebar hover:text-content-secondary'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                setDeletingChatId(chat.id)
              }}
              title="Delete"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function DeleteConfirmation({
  chatId,
  onDelete,
  onCancel,
  isDarkMode,
}: {
  chatId: string
  onDelete: (chatId: string) => void
  onCancel: () => void
  isDarkMode: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: {
          duration: 0.2,
          ease: 'easeOut',
        },
      }}
      exit={{
        opacity: 0,
        transition: {
          duration: 0.15,
        },
      }}
      className="absolute inset-x-0 top-0 z-50 flex gap-2 rounded-md bg-surface-sidebar p-2 shadow-lg"
    >
      <button
        className={`flex-1 rounded-md p-2 text-sm font-medium transition-colors ${
          isDarkMode
            ? 'bg-surface-sidebar text-content-inverse hover:bg-surface-sidebar/90'
            : 'bg-surface-chat text-content-secondary hover:bg-surface-chat/80'
        }`}
        onClick={(e) => {
          e.stopPropagation()
          onCancel()
        }}
      >
        Cancel
      </button>
      <button
        className={`flex-1 rounded-md p-2 text-sm font-medium transition-colors ${
          isDarkMode
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-red-500 text-white hover:bg-red-600'
        }`}
        onClick={(e) => {
          e.stopPropagation()
          onDelete(chatId)
          onCancel()
        }}
        autoFocus
      >
        Delete
      </button>
    </motion.div>
  )
}
