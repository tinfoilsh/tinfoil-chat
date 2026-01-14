import { API_BASE_URL, PAGINATION } from '@/config'
import { useProjects } from '@/hooks/use-projects'
import {
  isCloudSyncEnabled,
  setCloudSyncEnabled as setCloudSyncEnabledSetting,
} from '@/utils/cloud-sync-settings'
import { SignInButton, UserButton, useAuth, useUser } from '@clerk/nextjs'
import {
  ArrowDownTrayIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloudIcon,
  FolderIcon,
  FolderPlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { AiOutlineCloudSync } from 'react-icons/ai'
import { CiFloppyDisk } from 'react-icons/ci'
import { FaLock } from 'react-icons/fa6'
import { HiOutlineChevronDoubleLeft } from 'react-icons/hi2'
import { IoChatbubblesOutline } from 'react-icons/io5'
import { PiFolder, PiMicrophone, PiSparkle, PiSpinner } from 'react-icons/pi'
import { ChatList, type ChatItemData } from './chat-list'
import { formatRelativeTime } from './chat-list-utils'
import { CONSTANTS } from './constants'

import { useProject } from '@/components/project/project-context'
import { TextureGrid } from '@/components/texture-grid'
import { cn } from '@/components/ui/utils'
import { useCloudPagination } from '@/hooks/use-cloud-pagination'
import { cloudStorage } from '@/services/cloud/cloud-storage'
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

type ChatSidebarProps = {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  chats: Chat[]
  currentChat: Chat
  isDarkMode: boolean
  createNewChat: (isLocalOnly?: boolean, fromUserAction?: boolean) => void
  handleChatSelect: (chatId: string) => void
  updateChatTitle: (chatId: string, newTitle: string) => void
  deleteChat: (chatId: string) => void
  isClient: boolean
  isPremium?: boolean
  onEncryptionKeyClick?: () => void
  onCloudSyncSetupClick?: () => void
  onChatsUpdated?: () => void
  verificationComplete?: boolean
  verificationSuccess?: boolean
  onVerificationComplete?: (success: boolean) => void
  onVerificationUpdate?: (state: any) => void
  isProjectMode?: boolean
  activeProjectName?: string
  onEnterProject?: (projectId: string, projectName?: string) => Promise<void>
  onCreateProject?: () => Promise<void>
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
  onCloudSyncSetupClick,
  onChatsUpdated,
  isProjectMode,
  activeProjectName,
  onEnterProject,
  onCreateProject,
}: ChatSidebarProps) {
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      const shouldExpand = sessionStorage.getItem('expandProjectsOnMount')
      if (shouldExpand === 'true') {
        return true
      }
      const expandSection = sessionStorage.getItem('sidebarExpandSection')
      if (expandSection === 'projects') {
        return true
      }
    }
    return false
  })
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [isChatHistoryExpanded, setIsChatHistoryExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      const shouldExpandProjects = sessionStorage.getItem(
        'expandProjectsOnMount',
      )
      if (shouldExpandProjects === 'true') {
        sessionStorage.removeItem('expandProjectsOnMount')
        return false
      }
      const expandSection = sessionStorage.getItem('sidebarExpandSection')
      if (expandSection === 'projects') {
        return false
      }
    }
    return true
  })
  const [isChatListScrolled, setIsChatListScrolled] = useState(false)
  const chatListRef = useRef<HTMLDivElement>(null)
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 0,
  )
  const [isIOS, setIsIOS] = useState(false)
  const [highlightBox, setHighlightBox] = useState<'signin' | 'premium' | null>(
    null,
  )
  const [upgradeLoading, setUpgradeLoading] = useState(false)
  const [upgradeError, setUpgradeError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'cloud' | 'local'>(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('chatSidebarActiveTab')
      if (stored === 'cloud' || stored === 'local') {
        return stored
      }
    }
    return 'cloud'
  })
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(isCloudSyncEnabled())
  const { isSignedIn, getToken } = useAuth()
  const { user } = useUser()

  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    setIsMac(/Mac|iPod|iPhone|iPad/.test(navigator.platform))
  }, [])
  const modKey = isMac ? '⌘' : 'Ctrl+'

  const {
    projects,
    loading: projectsLoading,
    hasMore: hasMoreProjects,
    loadMore: loadMoreProjects,
    refresh: refreshProjects,
  } = useProjects({ autoLoad: isSignedIn && cloudSyncEnabled && isPremium })

  const { deleteProject } = useProject()
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(
    null,
  )

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

  // Persist active tab selection to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('chatSidebarActiveTab', activeTab)
  }, [activeTab])

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

  // Update blank chat's isLocalOnly when active tab changes
  useEffect(() => {
    if (!isSignedIn || !cloudSyncEnabled) return

    const shouldBeLocal = activeTab === 'local'

    // Only switch to blank chat if we're already on a blank chat
    // This ensures we don't interrupt the user when they've selected a real chat
    if (currentChat?.isBlankChat && currentChat.isLocalOnly !== shouldBeLocal) {
      createNewChat(shouldBeLocal, false)
    }
  }, [
    activeTab,
    isSignedIn,
    cloudSyncEnabled,
    createNewChat,
    currentChat?.isBlankChat,
    currentChat?.isLocalOnly,
  ])

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

  // Handle sidebar expand section when sidebar opens
  useEffect(() => {
    if (isOpen) {
      const expandSection = sessionStorage.getItem('sidebarExpandSection')
      if (expandSection === 'projects') {
        setIsProjectsExpanded(true)
        setIsChatHistoryExpanded(false)
        refreshProjects()
      } else if (expandSection === 'chats') {
        setIsProjectsExpanded(false)
        setIsChatHistoryExpanded(true)
      }
      sessionStorage.removeItem('sidebarExpandSection')
    }
  }, [isOpen, refreshProjects])

  // Initialize cloudStorage with token getter when component mounts
  useEffect(() => {
    if (isSignedIn && getToken) {
      // Set up token getter for cloudStorage using Clerk token
      cloudStorage.setTokenGetter(async () => {
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

  useEffect(() => {
    const chatList = chatListRef.current
    if (!chatList) return

    const handleScroll = () => {
      setIsChatListScrolled(chatList.scrollTop > 0)
    }

    handleScroll()
    chatList.addEventListener('scroll', handleScroll)
    return () => chatList.removeEventListener('scroll', handleScroll)
  }, [isChatHistoryExpanded])

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
    // Filter chats based on active tab and cloud sync status
    // Also exclude chats that belong to a project
    const filteredChats =
      isSignedIn && cloudSyncEnabled
        ? activeTab === 'cloud'
          ? chats.filter((chat) => {
              // Filter for cloud chats (not local-only) and not in a project
              return !chat.isLocalOnly && !chat.projectId
            })
          : chats.filter((chat) => {
              // Filter for local-only chats and not in a project
              return chat.isLocalOnly && !chat.projectId
            })
        : chats.filter((chat) => {
            // When cloud sync is disabled, only show local chats that aren't in a project
            return (chat as any).isLocalOnly && !chat.projectId
          })

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
        <div className="flex h-16 flex-none items-center justify-between p-4">
          <Link
            href="https://www.tinfoil.sh"
            title="Home"
            className="flex items-center"
          >
            <Logo className="mt-1 h-6 w-auto" dark={isDarkMode} />
          </Link>
          <div className="flex items-center gap-2">
            {/* Encryption key button */}
            {isSignedIn && cloudSyncEnabled && (
              <button
                type="button"
                onClick={onEncryptionKeyClick}
                className="rounded p-1.5 text-content-muted transition-all duration-200 hover:text-content-secondary"
                title="Encryption key"
              >
                <KeyIcon className="h-5 w-5" />
              </button>
            )}
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
          </div>
        </div>

        {/* Main sidebar content */}
        <div className="relative flex h-full flex-col overflow-hidden">
          <TextureGrid />
          {/* Message for non-premium users (signed in or not) */}
          {!isPremium && (
            <div
              className={`relative z-10 m-2 flex-none rounded-lg border p-4 transition-all duration-300 ${
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
                    <PiMicrophone className="h-4 w-4 flex-shrink-0 text-content-muted" />
                    <span>Speech-to-text voice input</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-content-secondary">
                    <PiSparkle className="h-4 w-4 flex-shrink-0 text-content-muted" />
                    <span>Selection of premium AI models</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-content-secondary">
                    <PiFolder className="h-4 w-4 flex-shrink-0 text-content-muted" />
                    <span>Create projects to chat with files</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-content-secondary">
                    <AiOutlineCloudSync className="h-4 w-4 flex-shrink-0 text-content-muted" />
                    <span>Cloud backups and device sync</span>
                  </div>
                </div>
                <div className="mt-4">
                  {isSignedIn ? (
                    <>
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
                        {upgradeLoading ? 'Redirecting…' : 'Subscribe'}
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
                    </>
                  ) : (
                    <div className="space-y-2">
                      <SignInButton mode="modal">
                        <span className="relative block w-full cursor-pointer rounded-md bg-brand-accent-dark px-4 py-2 text-center text-sm font-medium text-white transition-all hover:bg-brand-accent-dark/90">
                          Subscribe
                        </span>
                      </SignInButton>
                      <p className="text-center text-xs text-content-secondary">
                        Already subscribed?{' '}
                        <SignInButton mode="modal">
                          <span className="cursor-pointer underline hover:text-content-primary">
                            Log in
                          </span>
                        </SignInButton>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Divider after boxes */}
          {!isPremium && (
            <div className="relative z-10 border-b border-border-subtle" />
          )}

          {/* Chats Header */}
          <div
            className={cn(
              'relative z-10 flex-none border-t border-border-subtle',
              !isChatHistoryExpanded && 'border-b',
            )}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => setIsChatHistoryExpanded(!isChatHistoryExpanded)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setIsChatHistoryExpanded(!isChatHistoryExpanded)
                }
              }}
              className={cn(
                'flex w-full cursor-pointer items-center justify-between bg-surface-sidebar px-4 py-3 text-sm transition-colors',
                isDarkMode
                  ? 'text-content-secondary hover:bg-surface-chat'
                  : 'text-content-secondary hover:bg-white',
              )}
            >
              <span className="flex items-center gap-2">
                <IoChatbubblesOutline className="h-4 w-4" />
                <span className="truncate font-aeonik font-medium">Chats</span>
              </span>
              <div className="flex items-center gap-1">
                {chats.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      downloadChats(chats)
                    }}
                    className={`rounded p-1 transition-all duration-200 ${
                      isDarkMode
                        ? 'text-content-muted hover:bg-surface-chat hover:text-content-secondary'
                        : 'text-content-muted hover:bg-surface-sidebar hover:text-content-secondary'
                    }`}
                    title="Download all chats as ZIP"
                  >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                  </button>
                )}
                {isChatHistoryExpanded ? (
                  <ChevronDownIcon className="h-4 w-4" />
                ) : (
                  <ChevronRightIcon className="h-4 w-4" />
                )}
              </div>
            </div>

            {/* Expanded Chats content */}
            {isChatHistoryExpanded && (
              <>
                {/* Tabs for Cloud/Local chats - show when signed in and cloud sync is enabled */}
                {isSignedIn && cloudSyncEnabled && (
                  <div className="mx-4 mt-2 flex gap-1 rounded-lg bg-surface-chat p-1">
                    <button
                      onClick={() => setActiveTab('cloud')}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium transition-all ${
                        activeTab === 'cloud'
                          ? isDarkMode
                            ? 'border-brand-accent-light/60 bg-surface-sidebar text-white shadow-sm'
                            : 'border-brand-accent-light/60 bg-white text-content-primary shadow-sm'
                          : 'border-transparent text-content-muted hover:text-content-secondary'
                      }`}
                    >
                      <CloudIcon className="h-3.5 w-3.5" />
                      Cloud
                    </button>
                    <button
                      onClick={() => setActiveTab('local')}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium transition-all ${
                        activeTab === 'local'
                          ? isDarkMode
                            ? 'border-brand-accent-light/60 bg-surface-sidebar text-white shadow-sm'
                            : 'border-brand-accent-light/60 bg-white text-content-primary shadow-sm'
                          : 'border-transparent text-content-muted hover:text-content-secondary'
                      }`}
                    >
                      <CiFloppyDisk className="h-3.5 w-3.5" />
                      Local
                    </button>
                  </div>
                )}

                <div className="font-base mx-4 mt-1 min-h-[52px] pb-3 font-aeonik-fono text-xs text-content-muted">
                  {!isSignedIn ? (
                    'Your chats are stored temporarily in this browser tab. Create an account for persistent storage.'
                  ) : !cloudSyncEnabled || activeTab === 'local' ? (
                    "Local chats are stored only on this device and won't sync across devices."
                  ) : (
                    <>
                      Your chats are encrypted and synced to the cloud. The
                      encryption key is only stored on this browser and never
                      sent to Tinfoil.
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Scrollable Chat List */}
          {isChatHistoryExpanded && (
            <div
              ref={chatListRef}
              className={cn(
                'relative z-10 flex-1 overflow-y-auto',
                isChatListScrolled && 'border-t border-border-subtle',
              )}
            >
              {isClient && (
                <ChatList
                  chats={sortedChats as ChatItemData[]}
                  currentChatId={currentChat?.id}
                  currentChatIsBlank={currentChat?.isBlankChat}
                  currentChatIsLocalOnly={currentChat?.isLocalOnly}
                  isDarkMode={isDarkMode}
                  showEncryptionStatus={true}
                  showSyncStatus={true}
                  enableTitleAnimation={true}
                  onSelectChat={handleChatSelect}
                  onAfterSelect={() => {
                    if (windowWidth < MOBILE_BREAKPOINT) {
                      setIsOpen(false)
                    }
                  }}
                  onUpdateTitle={updateChatTitle}
                  onDeleteChat={deleteChat}
                  onEncryptionKeyClick={onEncryptionKeyClick}
                  emptyState={
                    activeTab === 'local' ? (
                      <div className="rounded-lg border border-border-subtle bg-surface-sidebar p-4 text-center">
                        <p className="text-sm text-content-muted">
                          No local chats yet
                        </p>
                        <p className="mt-1 text-xs text-content-muted">
                          Disable cloud sync in settings to create local-only
                          chats
                        </p>
                      </div>
                    ) : undefined
                  }
                  loadMoreButton={
                    <>
                      {shouldShowLoadMore && (
                        <button
                          onClick={() => loadMoreChats()}
                          disabled={isLoadingMore}
                          className={cn(
                            'w-full rounded-lg border px-3 py-2 text-center text-xs transition-colors',
                            isDarkMode
                              ? 'border-border-strong text-content-muted hover:text-content-secondary'
                              : 'border-border-subtle text-content-muted hover:text-content-secondary',
                            isLoadingMore && 'cursor-not-allowed opacity-50',
                          )}
                        >
                          {isLoadingMore ? 'Loading...' : 'Load more'}
                        </button>
                      )}
                      {isSignedIn &&
                        !shouldShowLoadMore &&
                        !hasMoreRemote &&
                        hasAttemptedLoadMore && (
                          <div className="px-3 py-2 text-center text-xs text-content-muted">
                            No more chats
                          </div>
                        )}
                    </>
                  }
                />
              )}
            </div>
          )}

          {/* Projects dropdown - show for premium users */}
          {isSignedIn && isPremium && (
            <div className="relative z-10 flex-none border-t border-border-subtle">
              <button
                onClick={() => {
                  const newExpanded = !isProjectsExpanded
                  setIsProjectsExpanded(newExpanded)
                  if (newExpanded && projects.length === 0) {
                    refreshProjects()
                  }
                }}
                className={cn(
                  'flex w-full items-center justify-between bg-surface-sidebar px-4 py-3 text-sm transition-colors',
                  isProjectMode
                    ? isDarkMode
                      ? 'text-emerald-400'
                      : 'text-emerald-600'
                    : isDarkMode
                      ? 'text-content-secondary hover:bg-surface-chat'
                      : 'text-content-secondary hover:bg-white',
                )}
              >
                <span className="flex items-center gap-2">
                  <FolderIcon className="h-4 w-4" />
                  <span className="font-aeonik font-medium">
                    {isProjectMode && activeProjectName
                      ? activeProjectName
                      : 'Projects'}
                  </span>
                </span>
                {isProjectsExpanded ? (
                  <ChevronDownIcon className="h-4 w-4" />
                ) : (
                  <ChevronRightIcon className="h-4 w-4" />
                )}
              </button>

              {/* Expanded projects list */}
              {isProjectsExpanded && (
                <div className="max-h-64 space-y-1 overflow-y-auto px-2 py-2">
                  {/* Cloud sync disabled message */}
                  {!cloudSyncEnabled ? (
                    <div className="px-3 py-2">
                      <p className="text-xs text-content-muted">
                        Projects require cloud sync to be enabled.
                      </p>
                      <button
                        onClick={() => {
                          if (onCloudSyncSetupClick) {
                            onCloudSyncSetupClick()
                          } else {
                            setCloudSyncEnabledSetting(true)
                            setCloudSyncEnabled(true)
                          }
                        }}
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-chat px-3 py-2 text-xs font-medium text-content-primary transition-colors hover:bg-surface-chat/80"
                      >
                        <CloudIcon className="h-3.5 w-3.5" />
                        Enable Cloud Sync
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Create new project button */}
                      {onCreateProject && (
                        <button
                          onClick={async () => {
                            setIsCreatingProject(true)
                            try {
                              await onCreateProject()
                              if (windowWidth < MOBILE_BREAKPOINT) {
                                setIsOpen(false)
                              }
                            } finally {
                              setIsCreatingProject(false)
                            }
                          }}
                          disabled={isCreatingProject}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                            isDarkMode
                              ? 'text-emerald-400 hover:bg-surface-chat'
                              : 'text-emerald-600 hover:bg-surface-sidebar',
                            isCreatingProject &&
                              'cursor-not-allowed opacity-50',
                          )}
                        >
                          {isCreatingProject ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                          ) : (
                            <FolderPlusIcon className="h-4 w-4 shrink-0" />
                          )}
                          <span className="truncate">
                            {isCreatingProject
                              ? 'Creating...'
                              : 'Create New Project'}
                          </span>
                        </button>
                      )}

                      {/* Projects list */}
                      {projectsLoading && projects.length === 0 ? (
                        <div className="flex justify-center px-3 py-2">
                          <PiSpinner className="h-4 w-4 animate-spin text-content-muted" />
                        </div>
                      ) : projects.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-content-muted">
                          No projects yet
                        </div>
                      ) : (
                        <>
                          {projects.map((project) => (
                            <div
                              key={project.id}
                              className={cn(
                                'group flex w-full items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-left text-sm transition-colors hover:border-border-subtle',
                                project.decryptionFailed
                                  ? 'cursor-default'
                                  : isDarkMode
                                    ? 'text-content-secondary hover:bg-surface-chat'
                                    : 'text-content-secondary hover:bg-surface-sidebar',
                              )}
                            >
                              <button
                                onClick={async () => {
                                  if (
                                    onEnterProject &&
                                    !project.decryptionFailed
                                  ) {
                                    await onEnterProject(
                                      project.id,
                                      project.name,
                                    )
                                  }
                                }}
                                className="flex min-w-0 flex-1 items-start gap-2 text-left"
                                disabled={project.decryptionFailed}
                              >
                                {project.decryptionFailed ? (
                                  <FaLock className="mt-0.5 h-4 w-4 shrink-0 self-start text-orange-500" />
                                ) : (
                                  <FolderIcon className="mt-0.5 h-4 w-4 shrink-0 self-start text-content-muted" />
                                )}
                                <div className="flex min-w-0 flex-1 flex-col">
                                  <span
                                    className={cn(
                                      'truncate leading-5',
                                      project.decryptionFailed &&
                                        'text-orange-500',
                                    )}
                                  >
                                    {project.name}
                                  </span>
                                  <span
                                    className={cn(
                                      'text-xs',
                                      project.decryptionFailed
                                        ? 'text-red-500'
                                        : 'text-content-muted',
                                    )}
                                  >
                                    {project.decryptionFailed
                                      ? 'Failed to decrypt: wrong key'
                                      : `Updated ${formatRelativeTime(new Date(project.updatedAt))}`}
                                  </span>
                                </div>
                              </button>
                              {project.decryptionFailed && (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    if (deletingProjectId === project.id) return
                                    setDeletingProjectId(project.id)
                                    try {
                                      await deleteProject(project.id)
                                      await refreshProjects()
                                    } finally {
                                      setDeletingProjectId(null)
                                    }
                                  }}
                                  disabled={deletingProjectId === project.id}
                                  className={cn(
                                    'shrink-0 rounded p-1 transition-colors',
                                    isDarkMode
                                      ? 'text-content-muted hover:bg-surface-chat hover:text-white'
                                      : 'text-content-muted hover:bg-surface-sidebar hover:text-content-secondary',
                                    deletingProjectId === project.id &&
                                      'opacity-50',
                                  )}
                                  title="Delete encrypted project"
                                >
                                  {deletingProjectId === project.id ? (
                                    <PiSpinner className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <TrashIcon className="h-4 w-4" />
                                  )}
                                </button>
                              )}
                            </div>
                          ))}

                          {/* Load more button */}
                          {hasMoreProjects && (
                            <button
                              onClick={() => loadMoreProjects()}
                              disabled={projectsLoading}
                              className={cn(
                                'w-full rounded-lg border px-3 py-2 text-center text-xs transition-colors',
                                isDarkMode
                                  ? 'border-border-strong text-content-muted hover:text-content-secondary'
                                  : 'border-border-subtle text-content-muted hover:text-content-secondary',
                                projectsLoading &&
                                  'cursor-not-allowed opacity-50',
                              )}
                            >
                              {projectsLoading ? 'Loading...' : 'Load more'}
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* App Store button for iOS users */}
          {isClient && isIOS && (
            <div className="relative z-10 flex-none border-t border-border-subtle p-3">
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
          <div className="relative z-10 mt-auto flex h-[56px] flex-none items-center justify-center border-t border-border-subtle bg-surface-sidebar p-3">
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

      {/* Close button on the right edge - outside overflow-hidden container */}
      <div
        className="group fixed top-8 z-40 -translate-y-1/2 transition-all duration-200 ease-in-out"
        style={{
          left: isOpen
            ? `min(85vw, ${CONSTANTS.CHAT_SIDEBAR_WIDTH_PX}px)`
            : `calc(min(85vw, ${CONSTANTS.CHAT_SIDEBAR_WIDTH_PX}px) - 100%)`,
        }}
      >
        <button
          onClick={() => setIsOpen(false)}
          aria-label="Close sidebar"
          className={cn(
            'rounded-r-lg border border-l-0 p-2 transition-colors',
            isDarkMode
              ? 'border-border-subtle bg-surface-sidebar text-content-secondary hover:bg-surface-chat hover:text-content-primary'
              : 'border-border-subtle bg-surface-sidebar text-content-secondary hover:bg-white hover:text-content-primary',
          )}
        >
          <HiOutlineChevronDoubleLeft className="h-4 w-4" />
        </button>
        <span
          className={cn(
            'pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded border border-border-subtle bg-surface-chat-background px-2 py-1 text-xs text-content-primary opacity-0 shadow-sm transition-opacity group-hover:opacity-100',
            !isOpen && 'hidden',
          )}
        >
          Close sidebar{' '}
          <span className="ml-1.5 text-content-muted">{modKey}.</span>
        </span>
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
