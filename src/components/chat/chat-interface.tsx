/* eslint-disable react/no-unescaped-entities */

'use client'

import {
  getAIModels,
  getSystemPrompt,
  type BaseModel,
} from '@/app/config/models'
import { useSubscriptionStatus } from '@/hooks/use-subscription-status'
import { useToast } from '@/hooks/use-toast'
import { useAuth, useUser } from '@clerk/nextjs'
import {
  ArrowDownIcon,
  Bars3Icon,
  Cog6ToothIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'

import { logError } from '@/utils/error-handling'
import { useCallback, useEffect, useRef, useState } from 'react'
import { VerifierSidebar } from '../verifier/verifier-sidebar'
import { ChatInput } from './chat-input'
import { ChatLabels } from './chat-labels'
import { ChatMessages } from './chat-messages'
import { ChatSidebar } from './chat-sidebar'
import { CONSTANTS } from './constants'
import { useDocumentUploader } from './document-uploader'
import { useChatState } from './hooks/use-chat-state'
import { useCustomSystemPrompt } from './hooks/use-custom-system-prompt'
import { SettingsSidebar } from './settings-sidebar'
import type { VerificationState } from './types'

type ChatInterfaceProps = {
  verificationState?: VerificationState
  showVerifyButton?: boolean
  minHeight?: string
  inputMinHeight?: string
  isDarkMode?: boolean
}

// Type for processed documents
type ProcessedDocument = {
  id: string
  name: string
  time: Date
  content?: string
  isUploading?: boolean
  imageData?: { base64: string; mimeType: string }
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
  const {
    chat_subscription_active,
    is_subscribed,
    api_subscription_active,
    isLoading: subscriptionLoading,
  } = useSubscriptionStatus()

  // State for API data
  const [models, setModels] = useState<BaseModel[]>([])
  const [systemPrompt, setSystemPrompt] = useState<string>('')
  const [isLoadingConfig, setIsLoadingConfig] = useState(true)

  // State for right sidebar
  const [isVerifierSidebarOpen, setIsVerifierSidebarOpen] = useState(() => {
    // Check if user has a saved preference
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('verifierSidebarClosed')
      // If user explicitly closed it before, respect that preference
      if (saved === 'true') {
        return false
      }
      // Otherwise, default to open on desktop
      return window.innerWidth >= CONSTANTS.MOBILE_BREAKPOINT
    }
    return false
  })

  // State for settings sidebar
  const [isSettingsSidebarOpen, setIsSettingsSidebarOpen] = useState(false)

  // State for tracking processed documents
  const [processedDocuments, setProcessedDocuments] = useState<
    ProcessedDocument[]
  >([])

  // Get the user's email
  const userEmail = user?.primaryEmailAddress?.emailAddress || ''

  // Use subscription status from hook
  const isPremium = chat_subscription_active ?? false

  // Use custom system prompt hook
  const { effectiveSystemPrompt } = useCustomSystemPrompt(systemPrompt)

  // Load models and system prompt
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const [modelsData, systemPromptData] = await Promise.all([
          getAIModels(isPremium),
          getSystemPrompt(),
        ])
        setModels(modelsData)
        setSystemPrompt(systemPromptData)
      } catch (error) {
        logError('Failed to load chat configuration', error, {
          component: 'ChatInterface',
          action: 'loadConfig',
        })
        toast({
          title: 'Configuration Error',
          description:
            'Failed to load chat configuration. Please refresh the page.',
          variant: 'destructive',
          position: 'top-left',
        })
      } finally {
        setIsLoadingConfig(false)
      }
    }

    if (!subscriptionLoading) {
      loadConfig()
    }
  }, [isPremium, subscriptionLoading, toast])

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
  } = useChatState({
    systemPrompt: effectiveSystemPrompt,
    storeHistory: isPremium,
    isPremium: isPremium,
    models: models,
    subscriptionLoading: subscriptionLoading,
  })

  // Get the selected model details
  const selectedModelDetails = models.find(
    (model) => model.modelName === selectedModel,
  ) as BaseModel | undefined

  // Initialize document uploader hook
  const { handleDocumentUpload } = useDocumentUploader(
    isPremium,
    selectedModelDetails,
  )

  // Handler for opening verifier sidebar
  const handleOpenVerifierSidebar = () => {
    setIsVerifierSidebarOpen(true)
    // Clear the saved preference when user opens it
    localStorage.removeItem('verifierSidebarClosed')
  }

  // Handler for setting verifier sidebar state with preference management
  const handleSetVerifierSidebarOpen = (isOpen: boolean) => {
    setIsVerifierSidebarOpen(isOpen)
    if (!isOpen) {
      // Save preference when user closes it
      localStorage.setItem('verifierSidebarClosed', 'true')
    } else {
      // Clear the saved preference when user opens it
      localStorage.removeItem('verifierSidebarClosed')
    }
  }

  // Handler for settings sidebar
  const handleOpenSettingsSidebar = () => {
    const newSettingsState = !isSettingsSidebarOpen
    setIsSettingsSidebarOpen(newSettingsState)
    // Close verifier sidebar when opening settings
    if (newSettingsState) {
      setIsVerifierSidebarOpen(false)
    }
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
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Set up scroll detection
  useEffect(() => {
    // Small delay to ensure ref is attached
    const setupScrollListener = () => {
      const scrollContainer = scrollContainerRef.current
      if (!scrollContainer) {
        // Retry if container not ready
        setTimeout(setupScrollListener, 100)
        return
      }

      const handleScroll = () => {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainer
        const distanceFromBottom = scrollHeight - (scrollTop + clientHeight)

        // Show button when scrolled up more than 200px from bottom
        const shouldShow = distanceFromBottom > 200
        setShowScrollButton(shouldShow)
      }

      scrollContainer.addEventListener('scroll', handleScroll, {
        passive: true,
      })

      // Initial check
      handleScroll()

      // Store cleanup function
      return () => {
        scrollContainer.removeEventListener('scroll', handleScroll)
      }
    }

    const cleanup = setupScrollListener()

    return () => {
      if (cleanup) cleanup()
    }
  }, [currentChat?.id]) // Re-run when chat changes

  // Function to scroll to bottom
  const handleScrollToBottom = () => {
    const scrollContainer = scrollContainerRef.current
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: 'smooth',
      })
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

  // Show loading state while checking subscription or loading config
  if (subscriptionLoading || isLoadingConfig) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-gray-800">
        <div className="relative h-10 w-10">
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900"></div>
          <div className="absolute inset-0 rounded-full border-4 border-gray-200 opacity-30"></div>
        </div>
      </div>
    )
  }

  // Show error state if no models are available (configuration error)
  if (!isLoadingConfig && models.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-gray-800">
        <div className="text-center">
          <div className="mb-2 text-xl text-red-500">⚠️</div>
          <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Configuration Error
          </h2>
          <p className="mb-4 text-gray-600 dark:text-gray-400">
            No models are available. Please check the API configuration.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-white hover:bg-emerald-600"
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
        isDarkMode ? 'bg-gray-800' : 'bg-white'
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
      {/* Sidebar toggle button - visible when left sidebar is closed, hidden when open */}
      {!isSidebarOpen &&
        !(
          windowWidth < CONSTANTS.MOBILE_BREAKPOINT && isVerifierSidebarOpen
        ) && (
          <button
            className={`fixed left-4 top-4 z-50 flex items-center justify-center gap-2 rounded-lg p-2.5 transition-all duration-200 ${
              isDarkMode
                ? 'bg-gray-900 text-gray-300 hover:bg-gray-800'
                : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
            }`}
            onClick={() => setIsSidebarOpen(true)}
          >
            <Bars3Icon className="h-5 w-5" />
          </button>
        )}

      {/* Right side toggle buttons */}
      {!(windowWidth < CONSTANTS.MOBILE_BREAKPOINT && isSidebarOpen) && (
        <div className="fixed right-4 top-4 z-50 flex gap-2">
          {/* Verifier toggle button - visible when verifier sidebar is closed */}
          {!isVerifierSidebarOpen && (
            <button
              className={`flex items-center justify-center gap-2 rounded-lg p-2.5 transition-all duration-200 ${
                isDarkMode
                  ? 'bg-gray-900 text-gray-300 hover:bg-gray-800'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
              }`}
              onClick={handleOpenVerifierSidebar}
            >
              <ShieldCheckIcon className="h-5 w-5" />
            </button>
          )}

          {/* Settings toggle button - visible when settings sidebar is closed AND verifier sidebar is closed */}
          {!isSettingsSidebarOpen && !isVerifierSidebarOpen && (
            <button
              className={`flex items-center justify-center gap-2 rounded-lg p-2.5 transition-all duration-200 ${
                isDarkMode
                  ? 'bg-gray-900 text-gray-300 hover:bg-gray-800'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
              }`}
              onClick={handleOpenSettingsSidebar}
            >
              <Cog6ToothIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      )}

      {/* Left Sidebar Component - For all users, but with limited functionality for basic */}
      <ChatSidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        chats={isPremium ? chats : [currentChat]}
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
        selectedModel={selectedModel}
        isPremium={isPremium}
      />

      {/* Right Verifier Sidebar */}
      <VerifierSidebar
        isOpen={isVerifierSidebarOpen}
        setIsOpen={handleSetVerifierSidebarOpen}
        verificationComplete={verificationComplete}
        verificationSuccess={verificationSuccess}
        onVerificationComplete={(success) => {
          setVerificationComplete(true)
          setVerificationSuccess(success)
        }}
        isDarkMode={isDarkMode}
        isClient={isClient}
      />

      {/* Settings Sidebar */}
      <SettingsSidebar
        isOpen={isSettingsSidebarOpen}
        setIsOpen={setIsSettingsSidebarOpen}
        isDarkMode={isDarkMode}
        toggleTheme={toggleTheme}
        isClient={isClient}
        defaultSystemPrompt={systemPrompt}
      />

      {/* Main Chat Area - Modified for sliding effect */}
      <div
        className="fixed inset-0 overflow-hidden transition-all duration-200"
        style={{
          right:
            (isVerifierSidebarOpen || isSettingsSidebarOpen) &&
            windowWidth >= CONSTANTS.MOBILE_BREAKPOINT
              ? '300px'
              : '0',
          bottom: 0,
          left:
            isSidebarOpen && windowWidth >= CONSTANTS.MOBILE_BREAKPOINT
              ? '300px'
              : '0',
          top: 0,
        }}
      >
        <div
          className={`relative flex h-full flex-col ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}
        >
          {/* Messages Area */}
          <div
            ref={scrollContainerRef}
            className={`relative flex-1 overflow-y-auto ${
              isDarkMode ? 'bg-gray-800' : 'bg-white'
            }`}
            style={{
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <ChatMessages
              messages={currentChat?.messages || []}
              isThinking={isThinking}
              isDarkMode={isDarkMode}
              chatId={currentChat.id}
              messagesEndRef={messagesEndRef}
              openAndExpandVerifier={modifiedOpenAndExpandVerifier}
              isInitialLoad={isInitialLoad}
              setIsInitialLoad={setIsInitialLoad}
              isWaitingForResponse={isWaitingForResponse}
              isPremium={isPremium}
              models={models}
              subscriptionLoading={subscriptionLoading}
            />
          </div>

          {/* Input Form */}
          {isClient && (
            <div
              className={`relative flex-shrink-0 ${
                isDarkMode ? 'bg-gray-800' : 'bg-white'
              } p-4`}
              style={{
                minHeight: '80px',
                maxHeight: '50vh',
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)',
                transition: 'border 0.2s ease-in-out',
                borderTop: isBottomDragActive
                  ? '2px solid rgba(52, 211, 153, 0.5)' // emerald-400 with 50% opacity
                  : isDarkMode
                    ? '1px solid rgb(55, 65, 81)' // gray-700
                    : '1px solid rgb(229, 231, 235)', // gray-200
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
                  onSettingsClick={handleOpenSettingsSidebar}
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
    </div>
  )
}

// Default export as well
export default ChatInterface
