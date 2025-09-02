import {
  AiOutlineCloudSync,
  FaLock,
  MdOutlineCloudOff,
} from '@/components/icons/lazy-icons'
import { PAGINATION } from '@/config'
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

import { r2Storage } from '@/services/cloud/r2-storage'
import { encryptionService } from '@/services/encryption/encryption-service'
import {
  indexedDBStorage,
  type StoredChat,
} from '@/services/storage/indexed-db'
import { logError } from '@/utils/error-handling'
import { KeyIcon } from '@heroicons/react/24/outline'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from '../link'
import { Logo } from '../logo'
import type { Chat } from './types'

// Utility function to detect iOS devices
function isIOSDevice() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

// User-scoped pagination state to prevent data leaks across users
// Maps userId to their pagination state to ensure proper isolation
const userPaginationStates = new Map<
  string,
  {
    nextToken: string | undefined
    hasInitialized: boolean
  }
>()

// Helper to get user-specific pagination state
function getUserPaginationState(userId: string) {
  if (!userPaginationStates.has(userId)) {
    userPaginationStates.set(userId, {
      nextToken: undefined,
      hasInitialized: false,
    })
  }
  return userPaginationStates.get(userId)!
}

// Helper to clear pagination state for a user (e.g., on logout)
function clearUserPaginationState(userId: string) {
  userPaginationStates.delete(userId)
}

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
  createNewChat: () => void
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
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [highlightBox, setHighlightBox] = useState<'signin' | 'premium' | null>(
    null,
  )
  const { isSignedIn, getToken } = useAuth()
  const { user } = useUser()
  // Start optimistically assuming there might be more chats
  const [hasMoreRemote, setHasMoreRemote] = useState(false)
  const [hasAttemptedLoadMore, setHasAttemptedLoadMore] = useState(false)
  const previousChatCount = useRef(chats.length)
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Use global pagination state for persistence across remounts
  const [, forceUpdate] = useState({})

  // Custom setter that updates user-scoped state and triggers re-render
  const setNextToken = useCallback(
    (token: string | undefined) => {
      if (user?.id) {
        const userState = getUserPaginationState(user.id)
        userState.nextToken = token
        forceUpdate({}) // Trigger re-render
      }
    },
    [user?.id],
  )

  // Token getter should be set by parent component that has access to getApiKey
  // The parent (ChatInterface) already sets this up through useCloudSync

  // Apply zoom prevention for mobile
  usePreventZoom()

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
  // 2. Either: we have more remote chats, OR we haven't tried loading yet and have enough chats to suggest pagination
  const shouldShowLoadMore =
    isSignedIn &&
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

  // Reset pagination state when user changes
  useEffect(() => {
    const userId = user?.id
    if (userId) {
      // Initialize user state if it doesn't exist
      // This automatically handles user changes since each user has their own state
      getUserPaginationState(userId)
    }
  }, [user?.id])

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
        // This was a new chat, reset pagination
        const resetPagination = async () => {
          try {
            // Get a fresh continuation token from the server
            const result = await r2Storage.listChats({
              limit: PAGINATION.CHATS_PER_PAGE,
              includeContent: false,
            })

            if (result.nextContinuationToken) {
              setNextToken(result.nextContinuationToken)
              setHasMoreRemote(true)
            } else {
              setHasMoreRemote(false)
              setNextToken(undefined)
            }
          } catch (error) {
            logError('Failed to reset pagination after new chat', error, {
              component: 'ChatSidebar',
              action: 'resetPagination',
            })
          }
        }

        resetPagination()
      }
    }

    // Update the previous count for next comparison
    previousChatCount.current = chats.length
  }, [chats.length, isSignedIn, setNextToken])

  // Clean up paginated chats on page refresh
  useEffect(() => {
    const cleanupAndInitialize = async () => {
      if (!isSignedIn || !user?.id) return

      const userState = getUserPaginationState(user.id)
      if (userState.hasInitialized) return

      try {
        // On page load, clean up chats loaded via pagination
        const allChats = await indexedDBStorage.getAllChats()

        // Sort by createdAt to determine which are beyond first page
        const sortedSyncedChats = allChats
          .filter(
            (chat) =>
              chat.syncedAt &&
              !(chat as any).isBlankChat &&
              !(chat as any).hasTemporaryId,
          )
          .sort((a, b) => {
            const timeA = new Date(a.createdAt).getTime()
            const timeB = new Date(b.createdAt).getTime()
            return timeB - timeA
          })

        // On page refresh, we want to keep only the first page of chats
        // to ensure a clean state that matches what cloud sync expects
        if (sortedSyncedChats.length > PAGINATION.CHATS_PER_PAGE) {
          let deletedAny = false
          const chatsToDelete = sortedSyncedChats.slice(
            PAGINATION.CHATS_PER_PAGE,
          )

          for (const chat of chatsToDelete) {
            // Delete all chats beyond the first page on refresh
            // They will be re-fetched via pagination if needed
            await indexedDBStorage.deleteChat(chat.id)
            deletedAny = true
          }

          if (deletedAny && onChatsUpdated) {
            onChatsUpdated()
          }
        }

        // Get the continuation token for page 2 (since page 1 is loaded during initial sync)
        const result = await r2Storage.listChats({
          limit: PAGINATION.CHATS_PER_PAGE,
        })

        if (result.nextContinuationToken) {
          // Only set the token if we don't already have a different one
          // (to avoid resetting after pagination has already started)
          if (
            !userState.nextToken ||
            userState.nextToken === result.nextContinuationToken
          ) {
            setNextToken(result.nextContinuationToken)
            setHasMoreRemote(true)
          }
        } else {
          // No more pages available
          setHasMoreRemote(false)
        }

        // Mark as initialized to prevent re-running
        userState.hasInitialized = true
      } catch (error) {
        logError('Failed to cleanup and initialize pagination', error, {
          component: 'ChatSidebar',
          action: 'cleanupAndInitialize',
        })
      }
    }

    cleanupAndInitialize()
  }, [isSignedIn, user?.id, onChatsUpdated, setNextToken])

  // Load more chats from backend
  const loadMoreChats = async () => {
    // Always use the user-scoped state for the most up-to-date token
    const currentToken = user?.id
      ? getUserPaginationState(user.id).nextToken
      : undefined

    if (isLoadingMore || !isSignedIn) return

    // If we don't have a token and have already attempted to load, there are no more pages
    if (!currentToken && hasAttemptedLoadMore) {
      setHasMoreRemote(false)
      return
    }

    setIsLoadingMore(true)
    setHasAttemptedLoadMore(true)

    try {
      // Initialize encryption service once before processing
      await encryptionService.initialize()

      // If we don't have a token yet, try to get the initial one
      let tokenToUse = currentToken

      if (!tokenToUse && !hasAttemptedLoadMore) {
        // Get the initial continuation token
        const initialResult = await r2Storage.listChats({
          limit: PAGINATION.CHATS_PER_PAGE,
          includeContent: false,
        })
        tokenToUse = initialResult.nextContinuationToken
      }

      if (!tokenToUse) {
        setHasMoreRemote(false)
        setIsLoadingMore(false)
        return
      }
      const result = await r2Storage.listChats({
        limit: PAGINATION.CHATS_PER_PAGE,
        continuationToken: tokenToUse,
        includeContent: true,
      })

      if (result.conversations && result.conversations.length > 0) {
        // Process chats in parallel for better performance
        const processPromises = result.conversations.map(async (conv) => {
          if (!conv.content) return

          try {
            const encrypted = JSON.parse(conv.content)

            // Try to decrypt the chat data
            let fullChat: StoredChat | null = null
            try {
              const decrypted = await encryptionService.decrypt(encrypted)
              fullChat = decrypted
            } catch (decryptError) {
              // Check if this is corrupted data (compressed)
              const isCorrupted =
                decryptError instanceof Error &&
                decryptError.message.includes('DATA_CORRUPTED')

              // If decryption fails, store the encrypted data for later retry
              fullChat = {
                id: conv.id,
                title: 'Encrypted',
                messages: [],
                createdAt: conv.createdAt,
                updatedAt: conv.updatedAt,
                lastAccessedAt: Date.now(),
                decryptionFailed: true,
                dataCorrupted: isCorrupted,
                encryptedData: conv.content,
                syncedAt: Date.now(),
                locallyModified: false,
                syncVersion: 1,
              } as StoredChat
            }

            if (fullChat) {
              // Save to IndexedDB - this will trigger a reload of chats
              await indexedDBStorage.saveChat(fullChat)
              // Mark as synced since we just downloaded from cloud
              await indexedDBStorage.markAsSynced(
                fullChat.id,
                fullChat.syncVersion || 0,
              )
            }
          } catch (error) {
            logError(`Failed to process chat ${conv.id}`, error, {
              component: 'ChatSidebar',
              action: 'loadMoreChats',
              metadata: { chatId: conv.id },
            })
          }
        })

        // Wait for all processing to complete
        await Promise.all(processPromises)

        // Mark that we just loaded more via pagination
        justLoadedMoreRef.current = true

        // Trigger parent component to reload chats from IndexedDB
        if (onChatsUpdated) {
          onChatsUpdated()
        }

        // Update pagination state
        setNextToken(result.nextContinuationToken)
        setHasMoreRemote(!!result.nextContinuationToken)
      } else {
        // No conversations returned - we've reached the end
        setHasMoreRemote(false)
        setHasAttemptedLoadMore(true)
      }
    } catch (error) {
      logError('Failed to load more chats', error, {
        component: 'ChatSidebar',
        action: 'loadMoreChats',
      })
    } finally {
      setIsLoadingMore(false)
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
        className={`${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed z-40 flex h-dvh w-[85vw] flex-col border-r ${
          isDarkMode
            ? 'border-gray-800 bg-gray-900'
            : 'border-gray-200 bg-white'
        } ${
          isInitialLoad ? '' : 'transition-all duration-200 ease-in-out'
        } overflow-hidden`}
        style={{ maxWidth: `${CONSTANTS.CHAT_SIDEBAR_WIDTH_PX}px` }}
      >
        {/* Header */}
        <div
          className={`flex h-16 flex-none items-center justify-between border-b ${
            isDarkMode ? 'border-gray-800' : 'border-gray-200'
          } p-4`}
        >
          <Link
            href="https://www.tinfoil.sh"
            title="Home"
            className="flex items-center"
          >
            <Logo className="mt-1 h-8 w-auto" dark={isDarkMode} />
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
              className={`hidden rounded-lg p-2 transition-all duration-200 md:block ${
                isDarkMode
                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => setIsOpen(!isOpen)}
            >
              {isOpen ? (
                <XMarkIcon className="h-5 w-5" />
              ) : (
                <Bars3Icon className="h-5 w-5" />
              )}
            </button>
            <button
              className={`rounded-lg p-2 transition-all duration-200 md:hidden ${
                isDarkMode
                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
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
              <h4
                className={`mb-1 text-sm font-semibold ${
                  isDarkMode ? 'text-gray-100' : 'text-gray-900'
                }`}
              >
                Sign in to unlock full features
              </h4>
              <p
                className={`mb-3 text-sm ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}
              >
                Access chat history and sync across devices.
              </p>
              <SignInButton mode="modal">
                <button
                  className={`w-full rounded-md px-4 py-2 text-sm font-medium transition-all ${
                    isDarkMode
                      ? 'bg-[#005050] text-white hover:bg-[#004040]'
                      : 'bg-[#005050] text-white hover:bg-[#004040]'
                  }`}
                >
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
                <h4
                  className={`mb-3 text-sm font-semibold ${
                    isDarkMode ? 'text-gray-100' : 'text-gray-900'
                  }`}
                >
                  Get more out of Tinfoil Chat
                </h4>
                <div className="space-y-2.5">
                  <div
                    className={`flex items-center gap-3 text-xs ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}
                  >
                    <svg
                      className={`h-4 w-4 flex-shrink-0 ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}
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

                  <div
                    className={`flex items-center gap-3 text-xs ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}
                  >
                    <svg
                      className={`h-4 w-4 flex-shrink-0 ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}
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

                  <div
                    className={`flex items-center gap-3 text-xs ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}
                  >
                    <svg
                      className={`h-4 w-4 flex-shrink-0 ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}
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
                  <Link
                    href="https://tinfoil.sh/pricing"
                    className={`inline-flex items-center gap-1 text-sm font-medium transition-colors ${
                      isDarkMode
                        ? 'text-emerald-400 hover:text-emerald-300'
                        : 'text-emerald-600 hover:text-emerald-500'
                    }`}
                  >
                    Upgrade to Pro
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
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Divider after boxes */}
          {(!isSignedIn || (isSignedIn && !isPremium)) && (
            <div
              className={`border-b ${
                isDarkMode ? 'border-gray-800' : 'border-gray-200'
              }`}
            />
          )}

          {/* New Chat button */}
          <div className="flex-none">
            <button
              onClick={() => {
                createNewChat()
                // Only close sidebar on mobile
                if (windowWidth < MOBILE_BREAKPOINT) {
                  setIsOpen(false)
                }
              }}
              className={`m-2 flex items-center gap-2 rounded-lg border p-3 text-sm ${
                currentChat?.messages?.length === 0
                  ? isDarkMode
                    ? 'cursor-not-allowed border-gray-700 text-gray-500 opacity-50'
                    : 'cursor-not-allowed border-gray-300 text-gray-400 opacity-50'
                  : isDarkMode
                    ? 'border-gray-700 text-gray-300 hover:border-gray-600 hover:bg-gray-800'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50'
              }`}
              disabled={currentChat?.messages?.length === 0}
            >
              <PlusIcon className="h-5 w-5" />
              New chat
            </button>
          </div>

          {/* Chat History Header */}
          <div
            className={`flex-none border-b ${
              isDarkMode
                ? 'border-gray-800 bg-gray-900'
                : 'border-gray-200 bg-white'
            } px-3 py-2 sm:px-4 sm:py-3`}
          >
            <div className="flex items-center justify-between">
              <h3
                className={`truncate text-sm font-medium ${
                  isDarkMode ? 'text-gray-200' : 'text-gray-800'
                }`}
              >
                Chat History
              </h3>
              <div className="flex items-center gap-1">
                {onEncryptionKeyClick && isSignedIn && (
                  <button
                    onClick={onEncryptionKeyClick}
                    className={`rounded-lg p-1.5 transition-all duration-200 ${
                      isDarkMode
                        ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-300'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
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
                        ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-300'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    }`}
                    title="Download all chats as ZIP"
                  >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div
              className={`mt-1 text-xs ${
                isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              {isSignedIn ? (
                <>
                  Your chats are encrypted and synced to the cloud.
                  <br />
                  The encryption key is only stored in your browser.
                </>
              ) : (
                'Your chats are stored temporarily in this browser tab.'
              )}
            </div>
          </div>

          {/* Scrollable Chat List */}
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-2 p-2">
              {isClient &&
                chats
                  .sort((a, b) => {
                    // Blank chats should always be at the top
                    const aIsBlank = a.isBlankChat === true
                    const bIsBlank = b.isBlankChat === true

                    if (aIsBlank && !bIsBlank) return -1
                    if (!aIsBlank && bIsBlank) return 1

                    // For non-empty chats, sort by createdAt (newest first)
                    const timeA = new Date(a.createdAt).getTime()
                    const timeB = new Date(b.createdAt).getTime()
                    return timeB - timeA
                  })
                  .map((chat) => (
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
                                ? 'cursor-pointer border-gray-700 hover:border-gray-600 hover:bg-gray-800'
                                : 'cursor-pointer border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                              : isDarkMode
                                ? 'cursor-not-allowed border-gray-700 opacity-60'
                                : 'cursor-not-allowed border-gray-300 opacity-60'
                            : currentChat?.id === chat.id
                              ? isDarkMode
                                ? 'cursor-pointer border-gray-700 bg-gray-800 text-white'
                                : 'cursor-pointer border-gray-300 bg-gray-100 text-gray-900'
                              : isDarkMode
                                ? 'cursor-pointer border-gray-700 text-gray-300 hover:border-gray-600 hover:bg-gray-800'
                                : 'cursor-pointer border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50'
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
                  className={`w-full rounded-lg p-3 text-center text-sm font-medium transition-colors ${
                    isDarkMode
                      ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-600'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400'
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
                  <div
                    className={`w-full rounded-lg p-3 text-center text-sm ${
                      isDarkMode ? 'text-gray-500' : 'text-gray-400'
                    }`}
                  >
                    No more chats
                  </div>
                )}
            </div>
          </div>

          {/* App Store button for iOS users */}
          {isClient && isIOS && (
            <div
              className={`flex-none border-t ${
                isDarkMode ? 'border-gray-800' : 'border-gray-200'
              } p-3`}
            >
              <div className="text-center">
                <p
                  className={`mb-2 text-sm font-medium ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}
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
          <div
            className={`flex h-[56px] flex-none items-center justify-center border-t ${
              isDarkMode
                ? 'border-gray-800 bg-gray-900'
                : 'border-gray-200 bg-white'
            } p-3`}
          >
            <p
              className={`text-center text-xs leading-relaxed ${
                isDarkMode ? 'text-gray-200' : 'text-gray-800'
              }`}
            >
              By using this service, you agree to Tinfoil&apos;s{' '}
              <Link
                href="https://tinfoil.sh/terms"
                className={
                  isDarkMode
                    ? 'text-white underline hover:text-gray-200'
                    : 'text-[#005050] underline hover:text-[#004040]'
                }
              >
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                href="https://tinfoil.sh/privacy"
                className={
                  isDarkMode
                    ? 'text-white underline hover:text-gray-200'
                    : 'text-[#005050] underline hover:text-[#004040]'
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
}) {
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
      <div className="flex w-full items-start justify-between">
        <div className="min-w-0 flex-1">
          {isEditing && isPremium ? (
            <form
              onSubmit={handleSubmit}
              className="w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                className={`w-full rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isDarkMode
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-200 text-gray-900'
                }`}
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
                  className={`truncate text-sm font-medium ${
                    chat.decryptionFailed
                      ? 'text-orange-500'
                      : isDarkMode
                        ? 'text-gray-100'
                        : 'text-gray-900'
                  }`}
                >
                  {chat.decryptionFailed ? 'Encrypted' : chat.title}
                </div>
                {/* New chat indicator */}
                {chat.messages.length === 0 && !chat.decryptionFailed && (
                  <div
                    className="h-1.5 w-1.5 rounded-full bg-blue-500"
                    title="New chat"
                  />
                )}
              </div>
              {/* Show decryption error with red text */}
              <div className="flex items-center gap-1.5">
                <div
                  className={`text-xs ${
                    chat.decryptionFailed
                      ? 'text-red-500'
                      : isDarkMode
                        ? 'text-gray-400'
                        : 'text-gray-500'
                  }`}
                >
                  {chat.decryptionFailed
                    ? (chat as any).dataCorrupted
                      ? 'Failed to decrypt: corrupted data'
                      : 'Failed to decrypt: wrong key'
                    : chat.messages.length === 0
                      ? '\u00A0' // Non-breaking space for consistent height
                      : formatRelativeTime(chat.createdAt)}
                </div>
                {/* Cloud sync indicator */}
                {chat.messages.length > 0 &&
                  !chat.syncedAt &&
                  (isSignedIn ? (
                    <AiOutlineCloudSync
                      className={`h-3 w-3 ${
                        isDarkMode ? 'text-gray-600' : 'text-gray-400'
                      }`}
                      title="Not synced to cloud"
                    />
                  ) : (
                    <MdOutlineCloudOff
                      className={`h-3 w-3 ${
                        isDarkMode ? 'text-gray-600' : 'text-gray-400'
                      }`}
                      title="Local only - not saved to cloud"
                    />
                  ))}
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
                    ? 'text-gray-400 hover:bg-gray-700 hover:text-white'
                    : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'
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
                  ? 'text-gray-400 hover:bg-gray-700 hover:text-white'
                  : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'
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
      className={`absolute inset-x-0 top-0 z-50 flex gap-2 rounded-md ${
        isDarkMode ? 'bg-gray-900' : 'bg-white'
      } p-2 shadow-lg`}
    >
      <button
        className={`flex-1 rounded-md p-2 text-sm font-medium transition-colors ${
          isDarkMode
            ? 'bg-gray-600 text-white hover:bg-gray-700'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
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
