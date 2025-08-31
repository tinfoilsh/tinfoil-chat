/* eslint-disable react/no-unescaped-entities */

'use client'

import {
  getAIModels,
  getSystemPromptAndRules,
  type BaseModel,
} from '@/app/config/models'
import { useSubscriptionStatus } from '@/hooks/use-subscription-status'
import { useToast } from '@/hooks/use-toast'
import { useAuth, useUser } from '@clerk/nextjs'
import {
  ArrowDownIcon,
  Bars3Icon,
  Cog6ToothIcon,
  PlusIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'

import { CLOUD_SYNC } from '@/config'
import { useCloudSync } from '@/hooks/use-cloud-sync'
import { useProfileSync } from '@/hooks/use-profile-sync'
import { migrationEvents } from '@/services/storage/migration-events'
import { logError } from '@/utils/error-handling'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ScrollableFeed from 'react-scrollable-feed'
import { CloudSyncIntroModal } from '../modals/cloud-sync-intro-modal'
import { EncryptionKeyModal } from '../modals/encryption-key-modal'
import { FirstLoginKeyModal } from '../modals/first-login-key-modal'
import { UrlHashMessageHandler } from '../url-hash-message-handler'
import { ChatInput } from './chat-input'
import { ChatLabels } from './chat-labels'
import { ChatMessages } from './chat-messages'
import { ChatSidebar } from './chat-sidebar'
import { CONSTANTS } from './constants'
import { useDocumentUploader } from './document-uploader'
import { useChatState } from './hooks/use-chat-state'
import { useCustomSystemPrompt } from './hooks/use-custom-system-prompt'
import { initializeRenderers } from './renderers/client'
import type { ProcessedDocument } from './renderers/types'
import type { VerificationState } from './types'
// Lazy-load heavy, non-critical UI to reduce initial bundle and speed up FCP
const VerifierSidebarLazy = dynamic(
  () => import('../verifier/verifier-sidebar').then((m) => m.VerifierSidebar),
  { ssr: false },
)
const SettingsSidebarLazy = dynamic(
  () => import('./settings-sidebar').then((m) => m.SettingsSidebar),
  { ssr: false },
)
const ShareModalLazy = dynamic(
  () => import('./share-modal').then((m) => m.ShareModal),
  { ssr: false },
)

type ChatInterfaceProps = {
  verificationState?: VerificationState
  showVerifyButton?: boolean
  minHeight?: string
  inputMinHeight?: string
  isDarkMode?: boolean
}

// Helper to roughly estimate token count based on character length (≈4 chars per token)
const estimateTokenCount = (text: string | undefined): number => {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

// Helper to parse values like "64k tokens" → 64000
const parseContextWindowTokens = (contextWindow?: string): number => {
  if (!contextWindow) return 64000 // sensible default
  const match = contextWindow.match(/(\d+)(k)?/i)
  if (!match) return 64000
  let tokens = parseInt(match[1], 10)
  if (match[2]) {
    tokens *= 1000
  }
  return tokens
}

export function ChatInterface({
  verificationState,
  minHeight,
  inputMinHeight = '28px',
  isDarkMode: propIsDarkMode,
}: ChatInterfaceProps) {
  const { toast } = useToast()
  const { isSignedIn } = useAuth()
  const { user } = useUser()
  const { chat_subscription_active, isLoading: subscriptionLoading } =
    useSubscriptionStatus()

  // Initialize cloud sync
  const {
    syncing,
    syncChats,
    encryptionKey,
    isFirstTimeUser,
    setEncryptionKey,
    retryDecryptionWithNewKey,
    clearFirstTimeUser,
    decryptionProgress,
  } = useCloudSync()

  // Initialize profile sync
  const {
    retryDecryption: retryProfileDecryption,
    syncFromCloud: syncProfileFromCloud,
    syncToCloud: syncProfileToCloud,
  } = useProfileSync()

  // State for API data
  const [models, setModels] = useState<BaseModel[]>([])
  const [systemPrompt, setSystemPrompt] = useState<string>('')
  const [rules, setRules] = useState<string>('')
  const [isLoadingConfig, setIsLoadingConfig] = useState(true)

  // State for right sidebar
  const [isVerifierSidebarOpen, setIsVerifierSidebarOpen] = useState(false)

  // State for settings sidebar
  const [isSettingsSidebarOpen, setIsSettingsSidebarOpen] = useState(false)

  // State for share modal
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)

  // State for encryption key modal
  const [isEncryptionKeyModalOpen, setIsEncryptionKeyModalOpen] =
    useState(false)

  // State for cloud sync intro modal
  const [isCloudSyncIntroModalOpen, setIsCloudSyncIntroModalOpen] =
    useState(false)

  // State for tracking processed documents
  const [processedDocuments, setProcessedDocuments] = useState<
    ProcessedDocument[]
  >([])

  // State for tracking verification status
  const [currentVerificationState, setCurrentVerificationState] =
    useState<any>(null)

  // Get the user's email
  const userEmail = user?.primaryEmailAddress?.emailAddress || ''

  // Use subscription status from hook
  const isPremium = chat_subscription_active ?? false

  // Use custom system prompt hook
  const { effectiveSystemPrompt, processedRules } = useCustomSystemPrompt(
    systemPrompt,
    rules,
  )

  // Initialize renderers on mount
  useEffect(() => {
    initializeRenderers()
  }, [])

  // Check for migration and show intro modal
  useEffect(() => {
    if (!isSignedIn || typeof window === 'undefined') return

    // Check if user has already seen the intro
    const hasSeenIntro = localStorage.getItem('hasSeenCloudSyncIntro')
    if (hasSeenIntro) return

    // Check if migration already happened (page refresh case)
    const hasMigrated = sessionStorage.getItem('pendingMigrationSync')
    if (hasMigrated === 'true') {
      setIsCloudSyncIntroModalOpen(true)
      localStorage.setItem('hasSeenCloudSyncIntro', 'true')
      return
    }

    // Listen for migration event
    const unsubscribe = migrationEvents.on('migration-completed', (event) => {
      // Only show modal if user hasn't seen it yet
      const hasSeenIntro = localStorage.getItem('hasSeenCloudSyncIntro')
      if (!hasSeenIntro && event.migratedCount > 0) {
        setIsCloudSyncIntroModalOpen(true)
        localStorage.setItem('hasSeenCloudSyncIntro', 'true')
      }
    })

    return unsubscribe
  }, [isSignedIn])

  // Load system prompt immediately; load paid models first if subscription is already known
  useEffect(() => {
    let cancelled = false
    const loadInitial = async () => {
      try {
        // Always fetch system prompt and rules ASAP
        const promptPromise = getSystemPromptAndRules()

        // If subscription is already known (from cache), prefer correct model set initially
        const isPremiumNow =
          !subscriptionLoading && (chat_subscription_active ?? false)
        const modelsPromise = getAIModels(isPremiumNow)

        const [promptData, initialModels] = await Promise.all([
          promptPromise,
          modelsPromise,
        ])
        if (!cancelled) {
          setSystemPrompt(promptData.systemPrompt)
          setRules(promptData.rules)
          setModels(initialModels)
          setIsLoadingConfig(false)
        }
      } catch (error) {
        logError('Failed to load chat configuration', error, {
          component: 'ChatInterface',
          action: 'loadConfig',
        })
        if (!cancelled) {
          setIsLoadingConfig(false)
        }
      }
    }

    loadInitial()
    return () => {
      cancelled = true
    }
  }, [subscriptionLoading, chat_subscription_active])

  const {
    // State
    chats,
    currentChat,
    input,
    loadingState,
    inputRef,
    isClient,
    isSidebarOpen,
    isDarkMode,
    messagesEndRef,
    isInitialLoad,
    isThinking,
    verificationComplete,
    verificationSuccess,
    isWaitingForResponse,
    selectedModel,
    expandedLabel,
    windowWidth,
    apiKey,

    // Setters
    setInput,
    setIsSidebarOpen,
    setIsInitialLoad,
    setVerificationComplete,
    setVerificationSuccess,

    // Actions
    handleSubmit,
    handleQuery,
    createNewChat,
    deleteChat,
    handleChatSelect,
    toggleTheme,
    openAndExpandVerifier,
    handleInputFocus,
    handleLabelClick,
    handleModelSelect,
    cancelGeneration,
    updateChatTitle,
    getApiKey,
    reloadChats,
  } = useChatState({
    systemPrompt: effectiveSystemPrompt,
    rules: processedRules,
    storeHistory: isSignedIn, // Enable storage for all signed-in users
    isPremium: isPremium,
    models: models,
    subscriptionLoading: subscriptionLoading,
  })

  // Effect to handle window resize and enforce single sidebar rule
  useEffect(() => {
    // When window becomes narrow and both types of sidebars are open, close the right one
    if (windowWidth < CONSTANTS.SINGLE_SIDEBAR_BREAKPOINT) {
      if (isSidebarOpen && (isVerifierSidebarOpen || isSettingsSidebarOpen)) {
        // Close right sidebars to prioritize left sidebar
        setIsVerifierSidebarOpen(false)
        setIsSettingsSidebarOpen(false)
      }
    }
  }, [windowWidth, isSidebarOpen, isVerifierSidebarOpen, isSettingsSidebarOpen])

  // Auto-focus input when component mounts and is ready
  useEffect(() => {
    if (isClient && !isLoadingConfig && !subscriptionLoading && currentChat) {
      // Small delay to ensure DOM is ready and input is rendered
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [isClient, isLoadingConfig, subscriptionLoading, currentChat, inputRef])

  // Get the selected model details
  const selectedModelDetails = models.find(
    (model) => model.modelName === selectedModel,
  ) as BaseModel | undefined

  // Initialize document uploader hook
  const { handleDocumentUpload } = useDocumentUploader(
    isPremium,
    selectedModelDetails,
  )

  // Sync chats and profile when user signs in and periodically
  useEffect(() => {
    if (!isSignedIn) return

    // Initial sync on page load/refresh - sync both chats and profile
    Promise.all([
      syncChats().then(() => {
        // Reload chats from IndexedDB after sync completes
        return reloadChats()
      }),
      syncProfileFromCloud().then(() => {
        // After syncing from cloud, sync local changes back to cloud
        return syncProfileToCloud()
      }),
    ]).catch((error) => {
      logError('Failed to sync data on page load', error, {
        component: 'ChatInterface',
        action: 'initialSync',
      })
    })

    // Sync at regular intervals
    const interval = setInterval(() => {
      Promise.all([
        syncChats().then(() => {
          // Reload chats from IndexedDB after sync completes
          return reloadChats()
        }),
        syncProfileFromCloud().then(() => {
          // After syncing from cloud, sync local changes back to cloud
          return syncProfileToCloud()
        }),
      ]).catch((error) => {
        logError('Failed to sync data (periodic)', error, {
          component: 'ChatInterface',
          action: 'periodicSync',
        })
      })
    }, CLOUD_SYNC.SYNC_INTERVAL)

    return () => clearInterval(interval)
  }, [
    isSignedIn,
    syncChats,
    reloadChats,
    syncProfileFromCloud,
    syncProfileToCloud,
  ])

  // Handler for opening verifier sidebar
  const handleOpenVerifierSidebar = () => {
    if (isVerifierSidebarOpen) {
      // If already open, close it
      handleSetVerifierSidebarOpen(false)
    } else {
      // Open verifier and close settings if open
      handleSetVerifierSidebarOpen(true)
      setIsSettingsSidebarOpen(false)
    }
  }

  // Handler for setting verifier sidebar state
  const handleSetVerifierSidebarOpen = (isOpen: boolean) => {
    setIsVerifierSidebarOpen(isOpen)
    if (isOpen) {
      // If window is narrow, close left sidebar when opening right sidebar
      if (windowWidth < CONSTANTS.SINGLE_SIDEBAR_BREAKPOINT) {
        setIsSidebarOpen(false)
      }
    }
  }

  // Handler for settings sidebar
  const handleOpenSettingsSidebar = () => {
    if (isSettingsSidebarOpen) {
      // If already open, close it
      setIsSettingsSidebarOpen(false)
    } else {
      // Open settings and close verifier if open
      setIsSettingsSidebarOpen(true)
      handleSetVerifierSidebarOpen(false)
      // If window is narrow, close left sidebar when opening settings
      if (windowWidth < CONSTANTS.SINGLE_SIDEBAR_BREAKPOINT) {
        setIsSidebarOpen(false)
      }
    }
  }

  // Handler for opening share modal
  const handleOpenShareModal = () => {
    setIsShareModalOpen(true)
  }

  // Handler for encryption key button
  const handleOpenEncryptionKeyModal = () => {
    setIsEncryptionKeyModalOpen(true)
  }

  // Don't automatically create new chats - let the chat state handle initialization
  // This effect has been removed to prevent unnecessary chat creation

  // Modified openAndExpandVerifier to use the right sidebar
  const modifiedOpenAndExpandVerifier = () => {
    // Always open the verifier sidebar when called
    const newState = !isVerifierSidebarOpen
    handleSetVerifierSidebarOpen(newState)
    // Close settings sidebar when opening verifier
    if (newState) {
      setIsSettingsSidebarOpen(false)
    }
  }

  // Document upload handler wrapper
  const handleFileUpload = useCallback(
    async (file: File) => {
      // Create a temporary document entry with uploading status
      const tempDocId = Math.random().toString(36).substring(2, 9)

      // Add placeholder document that shows as uploading
      setProcessedDocuments((prev) => [
        ...prev,
        {
          id: tempDocId,
          name: file.name,
          time: new Date(),
          isUploading: true,
        },
      ])

      await handleDocumentUpload(
        file,
        (content, documentId, imageData) => {
          const newDocTokens = estimateTokenCount(content)
          const contextLimit = parseContextWindowTokens(
            selectedModelDetails?.contextWindow,
          )

          // Check if adding would exceed context window
          const existingTokens = processedDocuments.reduce(
            (total, doc) => total + estimateTokenCount(doc.content),
            0,
          )

          if (existingTokens + newDocTokens > contextLimit) {
            // Remove the document if it would exceed the context limit
            setProcessedDocuments((prev) =>
              prev.filter((doc) => doc.id !== tempDocId),
            )

            toast({
              title: 'Context window saturated',
              description:
                "The selected model's context window is full. Remove a document or choose a model with a larger context window before uploading more files.",
              variant: 'destructive',
              position: 'top-left',
            })
            return
          }

          // Replace the placeholder with the actual document
          setProcessedDocuments((prev) => {
            return prev.map((doc) =>
              doc.id === tempDocId
                ? {
                    id: documentId,
                    name: file.name,
                    time: new Date(),
                    content,
                    imageData, // Store imageData in live session
                  }
                : doc,
            )
          })
        },
        (error, documentId) => {
          // On error, remove the placeholder document
          setProcessedDocuments((prev) =>
            prev.filter((doc) => doc.id !== tempDocId),
          )

          toast({
            title: 'Processing failed',
            description: error.message || 'Failed to process document',
            variant: 'destructive',
            position: 'top-left',
          })
        },
      )
    },
    [
      handleDocumentUpload,
      processedDocuments,
      selectedModelDetails?.contextWindow,
      toast,
    ],
  )

  // Handler for removing documents
  const removeDocument = (id: string) => {
    setProcessedDocuments((prev) => prev.filter((doc) => doc.id !== id))
  }

  // Calculate context usage percentage (memoized to prevent re-calculation during streaming)
  const contextUsagePercentage = useMemo(() => {
    // Calculate context usage
    const contextLimit = parseContextWindowTokens(
      selectedModelDetails?.contextWindow,
    )

    let totalTokens = 0

    // Count tokens from messages
    if (currentChat?.messages) {
      currentChat.messages.forEach((msg) => {
        totalTokens += estimateTokenCount(msg.content)
        if (msg.thoughts) {
          totalTokens += estimateTokenCount(msg.thoughts)
        }
      })
    }

    // Count tokens from documents
    if (processedDocuments) {
      processedDocuments.forEach((doc) => {
        totalTokens += estimateTokenCount(doc.content)
      })
    }

    return (totalTokens / contextLimit) * 100
  }, [
    currentChat?.messages,
    processedDocuments,
    selectedModelDetails?.contextWindow,
  ])

  // Wrap handleSubmit to include document content
  const wrappedHandleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Don't proceed if there's no input text
    if (!input.trim()) {
      return
    }

    // Filter out documents that are still uploading
    const completedDocuments = processedDocuments.filter(
      (doc) => !doc.isUploading,
    )

    // If we have completed documents, create a message with their content
    const docContent =
      completedDocuments.length > 0
        ? completedDocuments
            .map((doc) => doc.content)
            .filter((content) => content)
            .join('\n')
        : undefined

    const documentNames =
      completedDocuments.length > 0
        ? completedDocuments.map((doc) => ({ name: doc.name }))
        : undefined

    // Collect image data from documents for multimodal support
    const imageData =
      completedDocuments.length > 0
        ? completedDocuments
            .map((doc) => doc.imageData)
            .filter(
              (imgData): imgData is { base64: string; mimeType: string } =>
                imgData !== undefined,
            )
        : undefined

    // Call handleQuery with the input, document content, document names, and image data
    handleQuery(input, docContent, documentNames, imageData)

    // Only remove the completed documents from the state
    const remainingDocuments = processedDocuments.filter(
      (doc) => doc.isUploading,
    )
    setProcessedDocuments(remainingDocuments)
  }

  // --- Drag & Drop across bottom input area ---
  const [isBottomDragActive, setIsBottomDragActive] = useState(false)

  // State for scroll button
  const [showScrollButton, setShowScrollButton] = useState(false)
  const scrollableFeedRef = useRef<any>(null)

  // Function to scroll to bottom
  const handleScrollToBottom = () => {
    if (scrollableFeedRef.current && scrollableFeedRef.current.scrollToBottom) {
      scrollableFeedRef.current.scrollToBottom()
    }
  }

  const handleBottomDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsBottomDragActive(true)
  }, [])

  const handleBottomDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsBottomDragActive(false)
  }, [])

  const handleBottomDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsBottomDragActive(false)
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files[0])
      }
    },
    [handleFileUpload],
  )

  // Callback for scroll feed to prevent inline hook usage
  const handleScrollFeedScroll = useCallback((isAtBottom: boolean) => {
    setShowScrollButton(!isAtBottom)
  }, [])

  // Show loading state while critical config is loading. Do not block on subscription.
  if (isLoadingConfig) {
    return (
      <div
        className={`flex h-screen items-center justify-center ${
          isClient ? (isDarkMode ? 'bg-gray-900' : 'bg-white') : ''
        }`}
      >
        <div className="relative h-10 w-10">
          <div
            className={`absolute inset-0 animate-spin rounded-full border-4 ${
              isClient
                ? isDarkMode
                  ? 'border-gray-700 border-t-gray-100'
                  : 'border-gray-200 border-t-gray-900'
                : 'border-gray-700 border-t-gray-100'
            }`}
          ></div>
          <div
            className={`absolute inset-0 rounded-full border-4 ${
              isClient
                ? isDarkMode
                  ? 'border-gray-700 opacity-30'
                  : 'border-gray-200 opacity-30'
                : 'border-gray-700 opacity-30'
            }`}
          ></div>
        </div>
      </div>
    )
  }

  // Show error state if no models are available (configuration error)
  if (!isLoadingConfig && models.length === 0) {
    return (
      <div
        className={`flex h-screen items-center justify-center ${
          isClient ? (isDarkMode ? 'bg-gray-900' : 'bg-white') : ''
        }`}
      >
        <div className="text-center">
          <div className="mb-2 text-xl text-red-500">⚠️</div>
          <h2
            className={`mb-2 text-lg font-semibold ${
              isClient ? (isDarkMode ? 'text-gray-100' : 'text-gray-900') : ''
            }`}
          >
            Configuration Error
          </h2>
          <p
            className={`${
              isClient ? (isDarkMode ? 'text-gray-400' : 'text-gray-600') : ''
            } mb-4`}
          >
            No models are available. Please check the API configuration.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-[#005050] px-4 py-2 text-white hover:bg-[#004040]"
          >
            Refresh Page
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flex overflow-hidden ${
        isDarkMode ? 'bg-gray-900' : 'bg-white'
      }`}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        height: '100%',
        minHeight: '-webkit-fill-available',
        overscrollBehavior: 'none',
      }}
    >
      {/* URL Hash Message Handler */}
      <UrlHashMessageHandler
        isReady={!isLoadingConfig && isClient && !!currentChat}
        onMessageReady={(message) => {
          handleQuery(message)
        }}
      />

      {/* Sidebar toggle button - visible when left sidebar is closed, hidden when open */}
      {!isSidebarOpen &&
        !(
          windowWidth < CONSTANTS.MOBILE_BREAKPOINT &&
          (isVerifierSidebarOpen || isSettingsSidebarOpen)
        ) && (
          <button
            className={`fixed left-4 top-4 z-50 flex items-center justify-center gap-2 rounded-lg p-2.5 transition-all duration-200 ${
              isDarkMode
                ? 'bg-gray-900 text-gray-300 hover:bg-gray-800'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
            onClick={() => {
              setIsSidebarOpen(true)
              // If window is narrow, close right sidebars when opening left sidebar
              if (windowWidth < CONSTANTS.SINGLE_SIDEBAR_BREAKPOINT) {
                setIsVerifierSidebarOpen(false)
                setIsSettingsSidebarOpen(false)
              }
            }}
          >
            <Bars3Icon className="h-5 w-5" />
          </button>
        )}

      {/* Right side toggle buttons */}
      {!(
        windowWidth < CONSTANTS.MOBILE_BREAKPOINT &&
        (isSidebarOpen || isVerifierSidebarOpen || isSettingsSidebarOpen)
      ) && (
        <div
          className={`fixed top-4 z-50 flex gap-2 transition-all duration-300 ${
            isVerifierSidebarOpen || isSettingsSidebarOpen
              ? windowWidth >= CONSTANTS.MOBILE_BREAKPOINT
                ? 'right-[369px]'
                : 'right-4'
              : 'right-4'
          }`}
        >
          {/* New chat button */}
          <div className="group relative">
            <button
              className={`flex items-center justify-center gap-2 rounded-lg p-2.5 transition-all duration-200 ${
                currentChat?.messages?.length === 0
                  ? isDarkMode
                    ? 'cursor-not-allowed bg-gray-900 text-gray-500 opacity-50'
                    : 'cursor-not-allowed bg-white text-gray-400 opacity-50'
                  : isDarkMode
                    ? 'bg-gray-900 text-gray-300 hover:bg-gray-800'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
              onClick={createNewChat}
              aria-label="Create new chat"
              disabled={currentChat?.messages?.length === 0}
            >
              <PlusIcon className="h-5 w-5" />
            </button>
            <span
              className={`pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-2 py-1 text-xs opacity-0 transition-opacity ${
                currentChat?.messages?.length === 0
                  ? ''
                  : 'group-hover:opacity-100'
              } ${
                isDarkMode
                  ? 'bg-gray-700 text-gray-200'
                  : 'bg-gray-800 text-white'
              }`}
            >
              New chat
            </span>
          </div>

          {/* Settings toggle button */}
          <div className="group relative">
            <button
              className={`flex items-center justify-center gap-2 rounded-lg p-2.5 transition-all duration-200 ${
                isSettingsSidebarOpen
                  ? isDarkMode
                    ? 'cursor-default bg-gray-700 text-gray-400'
                    : 'cursor-default bg-gray-200 text-gray-400'
                  : isDarkMode
                    ? 'bg-gray-900 text-gray-300 hover:bg-gray-800'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
              onClick={handleOpenSettingsSidebar}
              aria-label={
                isSettingsSidebarOpen ? 'Close settings' : 'Open settings'
              }
              aria-pressed={isSettingsSidebarOpen}
            >
              <Cog6ToothIcon className="h-5 w-5" />
            </button>
            <span
              className={`pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-2 py-1 text-xs opacity-0 transition-opacity group-hover:opacity-100 ${
                isDarkMode
                  ? 'bg-gray-700 text-gray-200'
                  : 'bg-gray-800 text-white'
              }`}
            >
              {isSettingsSidebarOpen ? 'Close settings' : 'Settings'}
            </span>
          </div>

          {/* Verifier toggle button */}
          <div className="group relative">
            <button
              className={`flex items-center justify-center gap-2 rounded-lg p-2.5 transition-all duration-200 ${
                isVerifierSidebarOpen
                  ? isDarkMode
                    ? 'cursor-default bg-gray-700 text-gray-400'
                    : 'cursor-default bg-gray-200 text-gray-400'
                  : isDarkMode
                    ? 'bg-gray-900 text-gray-300 hover:bg-gray-800'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
              onClick={handleOpenVerifierSidebar}
              aria-label={
                isVerifierSidebarOpen
                  ? 'Close verification panel'
                  : 'Open verification panel'
              }
              aria-pressed={isVerifierSidebarOpen}
            >
              <ShieldCheckIcon className="h-5 w-5" />
            </button>
            <span
              className={`pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-2 py-1 text-xs opacity-0 transition-opacity group-hover:opacity-100 ${
                isDarkMode
                  ? 'bg-gray-700 text-gray-200'
                  : 'bg-gray-800 text-white'
              }`}
            >
              {isVerifierSidebarOpen ? 'Close verification' : 'Verification'}
            </span>
          </div>
        </div>
      )}

      {/* Left Sidebar Component - For all users, but with limited functionality for basic */}
      <ChatSidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        chats={chats}
        currentChat={currentChat}
        isDarkMode={isDarkMode}
        createNewChat={createNewChat}
        handleChatSelect={handleChatSelect}
        updateChatTitle={updateChatTitle}
        deleteChat={deleteChat}
        isClient={isClient}
        verificationComplete={verificationComplete}
        verificationSuccess={verificationSuccess}
        onVerificationComplete={(success) => {
          setVerificationComplete(true)
          setVerificationSuccess(success)
        }}
        isPremium={isPremium}
        onEncryptionKeyClick={
          isSignedIn ? handleOpenEncryptionKeyModal : undefined
        }
        onChatsUpdated={reloadChats}
      />

      {/* Right Verifier Sidebar */}
      <VerifierSidebarLazy
        isOpen={isVerifierSidebarOpen}
        setIsOpen={handleSetVerifierSidebarOpen}
        verificationComplete={verificationComplete}
        verificationSuccess={verificationSuccess}
        onVerificationComplete={(success) => {
          setVerificationComplete(true)
          setVerificationSuccess(success)
        }}
        onVerificationUpdate={setCurrentVerificationState}
        isDarkMode={isDarkMode}
        isClient={isClient}
      />

      {/* Share Modal */}
      <ShareModalLazy
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        messages={currentChat?.messages || []}
        isDarkMode={isDarkMode}
        isSidebarOpen={
          isSidebarOpen && windowWidth >= CONSTANTS.MOBILE_BREAKPOINT
        }
        isRightSidebarOpen={
          (isVerifierSidebarOpen || isSettingsSidebarOpen) &&
          windowWidth >= CONSTANTS.MOBILE_BREAKPOINT
        }
      />

      {/* Settings Sidebar */}
      <SettingsSidebarLazy
        isOpen={isSettingsSidebarOpen}
        setIsOpen={setIsSettingsSidebarOpen}
        isDarkMode={isDarkMode}
        toggleTheme={toggleTheme}
        isClient={isClient}
        defaultSystemPrompt={systemPrompt}
        onEncryptionKeyClick={
          isSignedIn ? handleOpenEncryptionKeyModal : undefined
        }
      />

      {/* Main Chat Area - Modified for sliding effect */}
      <div
        className="fixed inset-0 overflow-hidden transition-all duration-200"
        style={{
          right:
            (isVerifierSidebarOpen || isSettingsSidebarOpen) &&
            windowWidth >= CONSTANTS.MOBILE_BREAKPOINT
              ? `${CONSTANTS.SETTINGS_SIDEBAR_WIDTH_PX}px`
              : '0',
          bottom: 0,
          left:
            isSidebarOpen && windowWidth >= CONSTANTS.MOBILE_BREAKPOINT
              ? `${CONSTANTS.CHAT_SIDEBAR_WIDTH_PX}px`
              : '0',
          top: 0,
        }}
      >
        <div
          className={`relative flex h-full flex-col ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}
        >
          {/* Decryption Progress Banner */}
          {decryptionProgress && decryptionProgress.isDecrypting && (
            <div
              className={`border-b px-4 py-2 ${
                isDarkMode
                  ? 'border-gray-700 bg-gray-900 text-gray-300'
                  : 'border-gray-200 bg-blue-50 text-gray-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg
                    className="h-4 w-4 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span className="text-sm">
                    Decrypting chats with new key...
                  </span>
                </div>
                {decryptionProgress.total > 0 && (
                  <span className="text-sm">
                    {decryptionProgress.current} / {decryptionProgress.total}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Messages Area */}
          <ScrollableFeed
            ref={scrollableFeedRef}
            className={`relative flex-1 ${
              isDarkMode ? 'bg-gray-900' : 'bg-white'
            }`}
            onScroll={handleScrollFeedScroll}
          >
            <ChatMessages
              messages={currentChat?.messages || []}
              isDarkMode={isDarkMode}
              chatId={currentChat.id}
              messagesEndRef={messagesEndRef}
              openAndExpandVerifier={modifiedOpenAndExpandVerifier}
              isWaitingForResponse={isWaitingForResponse}
              isPremium={isPremium}
              models={models}
              subscriptionLoading={subscriptionLoading}
              verificationState={currentVerificationState}
              onSubmit={wrappedHandleSubmit}
              input={input}
              setInput={setInput}
              loadingState={loadingState}
              cancelGeneration={cancelGeneration}
              inputRef={inputRef}
              handleInputFocus={handleInputFocus}
              handleDocumentUpload={handleFileUpload}
              processedDocuments={processedDocuments}
              removeDocument={removeDocument}
              selectedModel={selectedModel}
              handleModelSelect={handleModelSelect}
              expandedLabel={expandedLabel}
              handleLabelClick={handleLabelClick}
            />
          </ScrollableFeed>

          {/* Input Form - Show on mobile always, on desktop only when there are messages */}
          {isClient &&
            (windowWidth < CONSTANTS.MOBILE_BREAKPOINT ||
              (currentChat?.messages && currentChat.messages.length > 0)) && (
              <div
                className={`relative flex-shrink-0 ${
                  isDarkMode ? 'bg-gray-900' : 'bg-white'
                } p-4`}
                style={{
                  minHeight: '80px',
                  maxHeight: '50vh',
                  paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)',
                  transition: 'border 0.2s ease-in-out',
                  borderTop: isBottomDragActive
                    ? '2px solid rgba(52, 211, 153, 0.5)' // emerald-400 with 50% opacity
                    : 'none',
                  borderLeft: isBottomDragActive
                    ? '2px solid rgba(52, 211, 153, 0.5)'
                    : 'none',
                  borderRight: isBottomDragActive
                    ? '2px solid rgba(52, 211, 153, 0.5)'
                    : 'none',
                  borderBottom: isBottomDragActive
                    ? '2px solid rgba(52, 211, 153, 0.5)'
                    : 'none',
                }}
                onDragOver={handleBottomDragOver}
                onDragLeave={handleBottomDragLeave}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsBottomDragActive(false)
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleFileUpload(e.dataTransfer.files[0])
                  }
                }}
              >
                <form
                  onSubmit={wrappedHandleSubmit}
                  className="mx-auto max-w-3xl px-3 md:px-8"
                >
                  {/* Labels - Model selection only for premium users */}
                  <ChatLabels
                    verificationComplete={verificationComplete}
                    verificationSuccess={verificationSuccess}
                    openAndExpandVerifier={modifiedOpenAndExpandVerifier}
                    expandedLabel={expandedLabel}
                    handleLabelClick={handleLabelClick}
                    selectedModel={selectedModel}
                    handleModelSelect={handleModelSelect}
                    isDarkMode={isDarkMode}
                    isPremium={isPremium}
                    models={models}
                    onShareClick={handleOpenShareModal}
                    hasMessages={
                      currentChat?.messages && currentChat.messages.length > 0
                    }
                    isCompactMode={
                      windowWidth < CONSTANTS.MOBILE_BREAKPOINT ||
                      (isSidebarOpen &&
                        (isVerifierSidebarOpen || isSettingsSidebarOpen))
                    }
                    contextUsagePercentage={contextUsagePercentage}
                  />

                  {/* Input */}
                  <ChatInput
                    input={input}
                    setInput={setInput}
                    handleSubmit={wrappedHandleSubmit}
                    loadingState={loadingState}
                    cancelGeneration={cancelGeneration}
                    inputRef={inputRef}
                    handleInputFocus={handleInputFocus}
                    inputMinHeight={inputMinHeight}
                    isDarkMode={isDarkMode}
                    handleDocumentUpload={handleFileUpload}
                    processedDocuments={processedDocuments}
                    removeDocument={removeDocument}
                    isPremium={isPremium}
                    hasMessages={
                      currentChat?.messages && currentChat.messages.length > 0
                    }
                  />
                </form>

                {/* Scroll to bottom button - absolutely positioned in parent */}
                {showScrollButton && currentChat?.messages?.length > 0 && (
                  <div className="absolute -top-[50px] left-1/2 z-10 -translate-x-1/2">
                    <button
                      onClick={handleScrollToBottom}
                      className={`flex h-10 w-10 items-center justify-center rounded-full ${
                        isDarkMode
                          ? 'bg-gray-700/80 shadow-lg hover:bg-gray-600'
                          : 'border border-gray-200 bg-white/90 shadow-md hover:bg-gray-50'
                      }`}
                      aria-label="Scroll to bottom"
                    >
                      <ArrowDownIcon
                        className={`h-4 w-4 ${
                          isDarkMode ? 'text-gray-300' : 'text-gray-600'
                        }`}
                        strokeWidth={2}
                      />
                    </button>
                  </div>
                )}
              </div>
            )}
        </div>
      </div>

      {/* Encryption Key Modal */}
      <EncryptionKeyModal
        isOpen={isEncryptionKeyModalOpen}
        onClose={() => setIsEncryptionKeyModalOpen(false)}
        encryptionKey={encryptionKey}
        onKeyChange={async (key: string) => {
          const syncResult = await setEncryptionKey(key)
          // If sync happened (key changed), reload chats
          if (syncResult) {
            await reloadChats()
            // Also retry profile decryption with the new key
            await retryProfileDecryption()
          }
        }}
        isDarkMode={isDarkMode}
      />

      {/* Cloud Sync Intro Modal */}
      <CloudSyncIntroModal
        isOpen={isCloudSyncIntroModalOpen}
        onClose={() => setIsCloudSyncIntroModalOpen(false)}
        isDarkMode={isDarkMode}
      />

      {/* First Login Key Modal */}
      {isFirstTimeUser && isSignedIn && (
        <FirstLoginKeyModal
          isOpen={true}
          onClose={() => clearFirstTimeUser()}
          onNewKey={() => {
            clearFirstTimeUser()
            // Key is already generated, just close the modal
          }}
          onImportKey={async (key: string) => {
            const syncResult = await setEncryptionKey(key)
            // If sync happened (key changed), reload chats
            if (syncResult) {
              await retryProfileDecryption()
              await reloadChats()
            }
            clearFirstTimeUser()
          }}
          isDarkMode={isDarkMode}
        />
      )}
    </div>
  )
}

// Default export as well
export default ChatInterface
