import { SignInButton, useAuth } from '@clerk/nextjs'
import {
  Bars3Icon,
  ChatBubbleLeftIcon,
  MoonIcon,
  PencilSquareIcon,
  PlusIcon,
  SunIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { motion } from 'framer-motion'

import { useEffect, useState } from 'react'
import { Link } from '../link'
import { Logo } from '../logo'

type Message = {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

type Chat = {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
}

type ChatSidebarProps = {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  chats: Chat[]
  currentChat: Chat
  isDarkMode: boolean
  toggleTheme: () => void
  createNewChat: () => void
  handleChatSelect: (chatId: string) => void
  updateChatTitle: (chatId: string, newTitle: string) => void
  deleteChat: (chatId: string) => void
  isClient: boolean
  verificationComplete: boolean
  verificationSuccess?: boolean
  repo: string
  enclave: string
  digest?: string
  selectedModel: string
  isPremium?: boolean
  onVerificationComplete: (success: boolean) => void
}

// Add this constant at the top of the file
const MOBILE_BREAKPOINT = 1024 // Same as in chat-interface.tsx

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
  toggleTheme,
  createNewChat,
  handleChatSelect,
  updateChatTitle,
  deleteChat,
  isClient,
  verificationComplete,
  verificationSuccess,
  onVerificationComplete,
  repo,
  enclave,
  digest,
  selectedModel,
  isPremium = true,
}: ChatSidebarProps) {
  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 0,
  )
  const { isSignedIn } = useAuth()

  // Apply zoom prevention for mobile
  usePreventZoom()

  // Add window resize listener
  useEffect(() => {
    if (isClient) {
      const handleResize = () => {
        setWindowWidth(window.innerWidth)
      }

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

  const handleThemeToggle = () => {
    toggleTheme()
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
          <Link href="https://www.tinfoil.sh" title="Home" className="flex items-center">
            <Logo className="h-8 w-auto mt-1" dark={isDarkMode} />
          </Link>
          <div className="flex items-center gap-3">
            <button
              className={`block rounded-lg p-2 transition-all duration-200 ${
                isDarkMode
                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={handleThemeToggle}
            >
              {isDarkMode ? (
                <SunIcon className="h-5 w-5" />
              ) : (
                <MoonIcon className="h-5 w-5" />
              )}
            </button>
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
          {/* New Chat button - only shown for premium users */}
          {isPremium && (
            <div className="flex-none">
              <button
                onClick={() => {
                  createNewChat()
                  // Only close sidebar on mobile
                  if (windowWidth < MOBILE_BREAKPOINT) {
                    setIsOpen(false)
                  }
                }}
                className={`m-2 flex items-center gap-2 rounded-md border p-2 pr-4 text-sm hover:bg-opacity-10 ${
                  isDarkMode
                    ? 'border-gray-700 text-gray-300 hover:bg-gray-800'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <PlusIcon className="h-5 w-5" />
                New chat
              </button>
            </div>
          )}

          {/* Message for non-premium users */}
          {!isPremium && (
            <div
              className={`m-2 flex-none rounded-md p-3 ${
                isDarkMode ? 'bg-gray-800' : 'bg-gray-100'
              }`}
            >
              <p className="text-sm">
                <span
                  className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}
                >
                  Sign up to access chat history and create new chats.
                </span>{' '}
                <SignInButton mode="modal">
                  <button className="font-semibold text-emerald-500 transition-colors hover:text-emerald-600">
                    Get unrestricted access
                  </button>
                </SignInButton>
              </p>
            </div>
          )}

          {/* Chat History Header */}
          <div
            className={`flex-none ${isPremium ? `border-b ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}` : ''} ${
              isDarkMode ? 'bg-gray-900' : 'bg-white'
            } px-3 py-2 sm:px-4 sm:py-3`}
          >
            {isPremium && (
              <>
                <h3
                  className={`truncate text-sm font-medium ${
                    isDarkMode ? 'text-gray-200' : 'text-gray-800'
                  }`}
                >
                  Chat History
                </h3>
                <div
                  className={`mt-1 truncate text-xs ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}
                >
                  Your chat history is stored locally in your browser.
                </div>
              </>
            )}
          </div>

          {/* Scrollable Chat List */}
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-2 p-2">
              {isClient &&
                chats.map((chat) => (
                  <div key={chat.id} className="relative">
                    <div
                      onClick={() => {
                        handleChatSelect(chat.id)
                        // Only close sidebar on mobile
                        if (windowWidth < MOBILE_BREAKPOINT) {
                          setIsOpen(false)
                        }
                      }}
                      className={`group flex w-full cursor-pointer items-center justify-between rounded-md p-2 text-left text-sm ${
                        currentChat?.id === chat.id
                          ? isDarkMode
                            ? 'bg-gray-800 text-white'
                            : 'bg-gray-100 text-gray-900'
                          : isDarkMode
                            ? 'text-gray-300 hover:bg-gray-800'
                            : 'text-gray-700 hover:bg-gray-100'
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
            </div>
          </div>

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
      <div className="flex w-full items-center justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <ChatBubbleLeftIcon
            className={`h-5 w-5 flex-shrink-0 ${
              isDarkMode ? 'text-gray-400' : 'text-gray-500'
            }`}
          />

          {isEditing && isPremium ? (
            <form
              onSubmit={handleSubmit}
              className="min-w-0 flex-1"
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
            <span className="truncate">{chat.title}</span>
          )}
        </div>

        {!isEditing && isPremium && (
          <div className="ml-2 flex opacity-0 transition-opacity group-hover:opacity-100">
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
