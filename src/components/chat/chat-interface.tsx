/* eslint-disable react/no-unescaped-entities */

'use client'

import {
  AI_MODELS,
  BASE_SYSTEM_PROMPT,
  type BaseModel,
} from '@/app/config/models'
import { useToast } from '@/hooks/use-toast'
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus'
import { SignInButton, useAuth } from '@clerk/nextjs'
import { Bars3Icon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ChatInput } from './chat-input'
import { ChatLabels } from './chat-labels'
import { ChatMessages } from './chat-messages'
import { ChatSidebar } from './chat-sidebar'
import { CONSTANTS } from './constants'
import { isRateLimitExceeded, recordMessage } from './rate-limit'
import { useChatState } from './use-chat-state'
import { VerifierSidebar } from './verifier-sidebar'

type ChatInterfaceProps = {
  verificationState?: any
  showVerifyButton?: boolean
  minHeight?: string
  inputMinHeight?: string
  isPremium?: boolean
}

export function ChatInterface({
  verificationState,
  minHeight,
  inputMinHeight = '28px',
  isPremium: propIsPremium,
}: ChatInterfaceProps) {
  const { toast } = useToast()
  const router = useRouter()
  const { isSignedIn } = useAuth()
  const {
    chat_subscription_active,
    is_subscribed,
    api_subscription_active,
    isLoading,
  } = useSubscriptionStatus()

  // State for right sidebar
  const [isVerifierSidebarOpen, setIsVerifierSidebarOpen] = useState(false)

  // Initialize verifier sidebar state based on screen size
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.innerWidth >= CONSTANTS.MOBILE_BREAKPOINT
    ) {
      setIsVerifierSidebarOpen(true)
    }
  }, [])

  // Use subscription status from hook or fallback to prop
  let isPremium = chat_subscription_active || propIsPremium
  if (isPremium === undefined) {
    isPremium = false
  }

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

    // Setters
    setInput,
    setIsSidebarOpen,
    setIsInitialLoad,
    setVerificationComplete,
    setVerificationSuccess,

    // Actions
    handleSubmit: originalHandleSubmit,
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
  } = useChatState({
    systemPrompt: BASE_SYSTEM_PROMPT,
    storeHistory: isPremium,
    isPremium: isPremium,
  }) as any

  // Handler for opening verifier sidebar
  const handleOpenVerifierSidebar = () => {
    setIsVerifierSidebarOpen(true)
  }

  // Modified openAndExpandVerifier to use the right sidebar
  const modifiedOpenAndExpandVerifier = () => {
    // Always open the verifier sidebar when called
    setIsVerifierSidebarOpen(!isVerifierSidebarOpen)
  }

  // Wrap the original handleSubmit with rate limiting
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isPremium && isRateLimitExceeded()) {
      toast({
        title: 'Message limit reached',
        description: `You've reached your daily usage limit. Please try again tomorrow or subscribe.`,
        variant: 'destructive',
        position: 'top-right',
      })
      return
    }

    // Record the message attempt and show remaining count
    if (!isPremium) {
      const remaining = recordMessage()
      if (remaining <= 3) {
        toast({
          title: 'Message limit approaching',
          description: `You are approaching your daily usage limit.`,
          position: 'top-right',
        })
      }
    }

    return originalHandleSubmit(e)
  }

  // Get the selected model details
  const selectedModelDetails = AI_MODELS(isPremium).find(
    (model) => model.modelName === selectedModel,
  ) as BaseModel | undefined

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

      {/* Verifier toggle button - visible when verifier sidebar is closed, hidden when open */}
      {!isVerifierSidebarOpen &&
        !(windowWidth < CONSTANTS.MOBILE_BREAKPOINT && isSidebarOpen) && (
          <button
            className={`fixed right-4 top-4 z-50 flex items-center justify-center gap-2 rounded-lg p-2.5 transition-all duration-200 ${
              isDarkMode
                ? 'bg-gray-900 text-gray-300 hover:bg-gray-800'
                : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
            }`}
            onClick={handleOpenVerifierSidebar}
          >
            <ShieldCheckIcon className="h-5 w-5" />
          </button>
        )}

      {/* Left Sidebar Component - For all users, but with limited functionality for basic */}
      <ChatSidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        chats={isPremium ? chats : [currentChat]}
        currentChat={currentChat}
        isDarkMode={isDarkMode}
        toggleTheme={toggleTheme}
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
        repo=""
        enclave=""
        digest=""
        selectedModel={selectedModel}
        isPremium={isPremium}
      />

      {/* Right Verifier Sidebar */}
      <VerifierSidebar
        isOpen={isVerifierSidebarOpen}
        setIsOpen={setIsVerifierSidebarOpen}
        repo={selectedModelDetails?.repo || ''}
        enclave={selectedModelDetails?.enclave || ''}
        digest={selectedModelDetails?.digest || ''}
        verificationComplete={verificationComplete}
        verificationSuccess={verificationSuccess}
        onVerificationComplete={(success) => {
          setVerificationComplete(true)
          setVerificationSuccess(success)
        }}
        isDarkMode={isDarkMode}
        isClient={isClient}
        selectedModel={selectedModel}
      />

      {/* Main Chat Area - Modified for sliding effect */}
      <div
        className="fixed inset-0 overflow-hidden transition-all duration-200"
        style={{
          right:
            isVerifierSidebarOpen && windowWidth >= CONSTANTS.MOBILE_BREAKPOINT
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
          className={`absolute inset-0 ${isDarkMode ? 'bg-gray-800' : 'bg-white'} overflow-hidden`}
        >
          {/* Premium upgrade notice for basic users */}
          {!isPremium && (
            <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 transform">
              <div
                className={`flex flex-col items-center space-y-1 rounded-lg px-4 py-2 sm:flex-row sm:space-x-2 sm:space-y-0 ${
                  isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
                }`}
              >
                <span
                  className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}
                >
                  Basic preview.
                </span>
                {isSignedIn ? (
                  <button
                    onClick={() => router.push('/dashboard?tab=billing')}
                    className="text-sm font-semibold text-emerald-500 transition-colors hover:text-emerald-600"
                  >
                    Get unrestricted access
                  </button>
                ) : (
                  <SignInButton mode="modal">
                    <button className="text-sm font-semibold text-emerald-500 transition-colors hover:text-emerald-600">
                      Get unrestricted access
                    </button>
                  </SignInButton>
                )}
              </div>
            </div>
          )}

          <div
            className={`${currentChat?.messages?.length > 0 ? 'overflow-y-auto' : 'overflow-hidden'} md:pt-0 ${
              isDarkMode ? 'bg-gray-800' : 'bg-white'
            }`}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: '120px',
              height: 'auto',
              overscrollBehavior: 'none',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            <div className="h-full w-full">
              {/* Top fade gradient to prevent content from being hidden behind buttons/toast */}
              {currentChat?.messages?.length > 0 && (
                <div
                  className={`pointer-events-none sticky top-0 z-10 h-40 w-full md:h-[52px] ${
                    isDarkMode
                      ? 'bg-gradient-to-b from-gray-800 to-transparent'
                      : 'bg-gradient-to-b from-white to-transparent'
                  }`}
                />
              )}
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
              />
            </div>
          </div>

          {/* Input Form - Modified for Safari mobile fix */}
          {isClient && (
            <div
              className={`fixed bottom-0 left-0 right-0 z-10 ${
                isDarkMode
                  ? 'border-t border-gray-700 bg-gray-800'
                  : 'border-t border-gray-200 bg-white'
              } p-4`}
              style={{
                position: 'absolute',
                minHeight: '120px',
                maxHeight: '50vh',
                bottom: 0,
                left: 0,
                right: 0,
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)',
                transform: 'translateZ(0)',
                willChange: 'transform',
              }}
            >
              <form
                onSubmit={handleSubmit}
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
                />

                {/* Input */}
                <ChatInput
                  input={input}
                  setInput={setInput}
                  handleSubmit={handleSubmit}
                  loadingState={loadingState}
                  cancelGeneration={cancelGeneration}
                  inputRef={inputRef}
                  handleInputFocus={handleInputFocus}
                  inputMinHeight={inputMinHeight}
                  isDarkMode={isDarkMode}
                />
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Default export as well
export default ChatInterface
