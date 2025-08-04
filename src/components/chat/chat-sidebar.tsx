import { PAGINATION } from '@/config'
import { SignInButton, useAuth } from '@clerk/nextjs'
import {
  ArrowDownTrayIcon,
  Bars3Icon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { motion } from 'framer-motion'
import JSZip from 'jszip'
import { AiOutlineCloudSync } from 'react-icons/ai'
import { FaLock } from 'react-icons/fa'
import { UserButtonWithCleanup } from '../user-button-with-cleanup'

import { r2Storage } from '@/services/cloud/r2-storage'
import { encryptionService } from '@/services/encryption/encryption-service'
import {
  indexedDBStorage,
  type StoredChat,
} from '@/services/storage/indexed-db'
import { logError } from '@/utils/error-handling'
import { KeyIcon } from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import { Link } from '../link'
import { Logo } from '../logo'
import type { Chat } from './types'

// Utility function to detect iOS devices
function isIOSDevice() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
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
  verificationComplete: boolean
  verificationSuccess?: boolean
  selectedModel: string
  isPremium?: boolean
  onVerificationComplete: (success: boolean) => void
  onEncryptionKeyClick?: () => void
  onChatsUpdated?: () => void
}

// Add this constant at the top of the file
const MOBILE_BREAKPOINT = 1024 // Same as in chat-interface.tsx

// Function to download all chats as markdown files in a zip
function downloadChats(chats: Chat[]) {
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

    chat.messages.forEach((message, messageIndex) => {
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
  verificationComplete,
  verificationSuccess,
  onVerificationComplete,
  selectedModel,
  isPremium = true,
  onEncryptionKeyClick,
  onChatsUpdated,
}: ChatSidebarProps) {
  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null)
  // Show all local chats - pagination is only for remote
  const [displayedChatsCount, setDisplayedChatsCount] = useState(999999)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 0,
  )
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [nextToken, setNextToken] = useState<string | undefined>(undefined)
  const [isIOS, setIsIOS] = useState(false)
  const { isSignedIn, getToken } = useAuth()
  // Start optimistically assuming there might be more chats
  const [hasMoreRemote, setHasMoreRemote] = useState(false)
  const [hasAttemptedLoadMore, setHasAttemptedLoadMore] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)

  // Token getter should be set by parent component that has access to getApiKey
  // The parent (ChatInterface) already sets this up through useCloudSync

  // Apply zoom prevention for mobile
  usePreventZoom()

  // Calculate if we should show the Load More button optimistically
  // Show if: we have synced chats AND (we have a continuation token OR we have exactly PAGINATION.CHATS_PER_PAGE synced chats)
  const syncedChatsCount = chats.filter((chat) => chat.syncedAt).length
  // Simplified logic: Show load more if:
  // 1. User is signed in
  // 2. We haven't determined there are no more chats OR we haven't attempted to load yet
  // 3. We have enough chats to suggest pagination OR we have a continuation token
  const shouldShowLoadMore =
    isSignedIn &&
    (hasMoreRemote || !hasAttemptedLoadMore) &&
    (nextToken || chats.length >= PAGINATION.CHATS_PER_PAGE)

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

  // Reset pagination when chats change (e.g., new chat created, user switched)
  useEffect(() => {
    setDisplayedChatsCount(PAGINATION.CHATS_PER_PAGE)
  }, [chats.length])

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

  // Clean up paginated chats on page refresh
  useEffect(() => {
    const cleanupAndInitialize = async () => {
      if (!isSignedIn) return

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
          // Set the token to start from page 2
          setNextToken(result.nextContinuationToken)
          setHasMoreRemote(true)
        } else {
          // No more pages available
          setHasMoreRemote(false)
        }
        setIsInitialized(true)
      } catch (error) {
        logError('Failed to cleanup and initialize pagination', error, {
          component: 'ChatSidebar',
          action: 'cleanupAndInitialize',
        })
        setIsInitialized(true) // Set initialized even on error to prevent blocking
      }
    }

    cleanupAndInitialize()
  }, [isSignedIn, onChatsUpdated])

  // Load more chats from backend
  const loadMoreChats = async () => {
    if (isLoadingMore || !isSignedIn) return

    // If not initialized yet, wait for initialization
    if (!isInitialized) {
      return
    }

    // If we don't have a token after initialization, there are no more pages
    if (!nextToken) {
      setHasMoreRemote(false)
      return
    }

    setIsLoadingMore(true)
    setHasAttemptedLoadMore(true)

    try {
      const result = await r2Storage.listChats({
        limit: PAGINATION.CHATS_PER_PAGE,
        continuationToken: nextToken,
        includeContent: true,
      })

      if (result.conversations && result.conversations.length > 0) {
        // Process and save chat data to IndexedDB
        for (const conv of result.conversations) {
          if (!conv.content) continue

          try {
            const encrypted = JSON.parse(conv.content)

            // Try to decrypt the chat data
            let fullChat: StoredChat | null = null
            try {
              await encryptionService.initialize()
              const decrypted = await encryptionService.decrypt(encrypted)
              fullChat = decrypted
            } catch (decryptError) {
              // If decryption fails, store the encrypted data for later retry
              fullChat = {
                id: conv.id,
                title: 'Encrypted',
                messages: [],
                createdAt: conv.createdAt,
                updatedAt: conv.updatedAt,
                lastAccessedAt: Date.now(),
                decryptionFailed: true,
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
        }

        // Trigger parent component to reload chats from IndexedDB
        if (onChatsUpdated) {
          onChatsUpdated()
        }

        setNextToken(result.nextContinuationToken)
        setHasMoreRemote(!!result.nextContinuationToken)

        // If there's no next token, we've reached the end
        if (!result.nextContinuationToken) {
          setHasAttemptedLoadMore(true)
        }
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
      {/* Sidebar wrapper */}
      <div
        className={`${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed z-40 flex h-dvh w-[85vw] max-w-[300px] flex-col border-r ${
          isDarkMode
            ? 'border-gray-800 bg-gray-900'
            : 'border-gray-200 bg-white'
        } md:w-[300px] ${
          isInitialLoad ? '' : 'transition-all duration-200 ease-in-out'
        } overflow-hidden`}
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
              <UserButtonWithCleanup
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
          {/* New Chat button - shown for all signed-in users */}
          {isSignedIn && (
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
                  isDarkMode
                    ? 'border-gray-700 text-gray-300 hover:border-gray-600 hover:bg-gray-800'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                }`}
              >
                <PlusIcon className="h-5 w-5" />
                New chat
              </button>
            </div>
          )}

          {/* Message for non-signed-in users */}
          {!isSignedIn && (
            <div
              className={`m-2 flex-none rounded-md p-4 ${
                isDarkMode ? 'bg-gray-800' : 'bg-gray-100'
              }`}
            >
              <p
                className={`mb-3 text-sm ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-600'
                }`}
              >
                Sign in or create an account to access chat history and sync
                across devices.
              </p>
              <SignInButton mode="modal">
                <button
                  className={`w-full rounded-md px-3 py-2 text-sm font-medium transition-all ${
                    isDarkMode
                      ? 'border border-gray-600 bg-gray-700 text-white hover:bg-gray-600'
                      : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
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
              className={`m-2 flex-none rounded-md p-3 ${
                isDarkMode ? 'bg-gray-800' : 'bg-gray-100'
              }`}
            >
              <p className="text-sm">
                <span
                  className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}
                >
                  Upgrade to access premium features.
                </span>{' '}
                <Link
                  href="https://tinfoil.sh/pricing"
                  className="font-semibold text-emerald-500 transition-colors hover:text-emerald-600"
                >
                  View Plans
                </Link>
              </p>
            </div>
          )}

          {/* Chat History Header */}
          <div
            className={`flex-none ${isSignedIn ? `border-b ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}` : ''} ${
              isDarkMode ? 'bg-gray-900' : 'bg-white'
            } px-3 py-2 sm:px-4 sm:py-3`}
          >
            {isSignedIn && (
              <>
                <div className="flex items-center justify-between">
                  <h3
                    className={`truncate text-sm font-medium ${
                      isDarkMode ? 'text-gray-200' : 'text-gray-800'
                    }`}
                  >
                    Chat History
                  </h3>
                  <div className="flex items-center gap-1">
                    {onEncryptionKeyClick && (
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
                  Your chats are encrypted and synced to the cloud.
                  <br />
                  The encryption key is only stored in your browser.
                </div>
              </>
            )}
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
                        onClick={async () => {
                          // Don't allow selecting encrypted chats
                          if (chat.decryptionFailed) {
                            return
                          }

                          handleChatSelect(chat.id)

                          // Only close sidebar on mobile
                          if (windowWidth < MOBILE_BREAKPOINT) {
                            setIsOpen(false)
                          }
                        }}
                        onTouchEnd={(e) => {
                          // Prevent the click event from firing after touch
                          e.preventDefault()
                          // Don't allow selecting encrypted chats
                          if (chat.decryptionFailed) {
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
                            ? isDarkMode
                              ? 'cursor-not-allowed border-gray-700 text-gray-500'
                              : 'cursor-not-allowed border-gray-300 text-gray-400'
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
                        />
                      </div>
                      {/* Delete confirmation */}
                      {deletingChatId === chat.id && isPremium && (
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
              className={`text-xs ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              } text-center leading-relaxed`}
            >
              By using this service, you agree to Tinfoil&apos;s{' '}
              <Link
                href="https://tinfoil.sh/terms"
                className="text-emerald-500 hover:text-emerald-600"
              >
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                href="https://tinfoil.sh/privacy"
                className="text-emerald-500 hover:text-emerald-600"
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
              <div className="flex items-center gap-1">
                <div
                  className={`truncate text-sm font-medium ${
                    isDarkMode ? 'text-gray-100' : 'text-gray-900'
                  }`}
                >
                  {chat.decryptionFailed ? 'Encrypted' : chat.title}
                </div>
                {/* Lock icon for encrypted chats */}
                {chat.decryptionFailed && (
                  <FaLock
                    className={`h-3 w-3 ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}
                    title="Encrypted chat"
                  />
                )}
                {/* New chat indicator */}
                {chat.messages.length === 0 && !chat.decryptionFailed && (
                  <div
                    className="h-1.5 w-1.5 rounded-full bg-blue-500"
                    title="New chat"
                  />
                )}
              </div>
              {/* Show timestamp with sync indicator or decryption error */}
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
                    ? 'Failed to decrypt: wrong key'
                    : chat.messages.length === 0
                      ? '\u00A0' // Non-breaking space for consistent height
                      : formatRelativeTime(chat.createdAt)}
                </div>
                {/* Cloud sync indicator - show when chat has messages but not synced */}
                {chat.messages.length > 0 && !chat.syncedAt && (
                  <AiOutlineCloudSync
                    className={`h-3 w-3 ${
                      isDarkMode ? 'text-gray-600' : 'text-gray-400'
                    }`}
                    title="Not synced to cloud"
                  />
                )}
              </div>
            </>
          )}
        </div>

        {!isEditing && isPremium && (
          <div className="ml-2 flex opacity-0 transition-opacity group-hover:opacity-100">
            {!chat.decryptionFailed && (
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
