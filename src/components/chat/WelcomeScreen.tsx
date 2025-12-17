import { type BaseModel } from '@/config/models'
import { useClerk, useUser } from '@clerk/nextjs'
import { motion } from 'framer-motion'
import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import { ChatInput } from './chat-input'
import { ModelSelector } from './model-selector'
import type { ProcessedDocument } from './renderers/types'
import type { LabelType, LoadingState } from './types'
import { VerificationStatusDisplay } from './verification-status-display'

interface WelcomeScreenProps {
  isDarkMode: boolean
  openAndExpandVerifier: () => void
  setIsSidebarOpen?: (isOpen: boolean) => void
  isPremium?: boolean
  models?: BaseModel[]
  subscriptionLoading?: boolean
  verificationState?: any
  onSubmit?: (e: React.FormEvent) => void
  input?: string
  setInput?: (value: string) => void
  loadingState?: LoadingState
  cancelGeneration?: () => void
  inputRef?: React.RefObject<HTMLTextAreaElement>
  handleInputFocus?: () => void
  handleDocumentUpload?: (file: File) => Promise<void>
  processedDocuments?: ProcessedDocument[]
  removeDocument?: (id: string) => void
  selectedModel?: string
  handleModelSelect?: (model: string) => void
  expandedLabel?: LabelType
  handleLabelClick?: (
    label: Exclude<LabelType, null>,
    action: () => void,
  ) => void
}

export const WelcomeScreen = memo(function WelcomeScreen({
  isDarkMode,
  openAndExpandVerifier,
  setIsSidebarOpen,
  isPremium,
  models,
  subscriptionLoading,
  verificationState,
  onSubmit,
  input,
  setInput,
  loadingState,
  cancelGeneration,
  inputRef,
  handleInputFocus,
  handleDocumentUpload,
  processedDocuments,
  removeDocument,
  selectedModel,
  handleModelSelect,
  expandedLabel,
  handleLabelClick,
}: WelcomeScreenProps) {
  const { user, isSignedIn } = useUser()
  const { openSignIn } = useClerk()
  const [nickname, setNickname] = useState<string>('')
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({})
  const fallbackInputRef = useRef<HTMLTextAreaElement>(null)

  const handleImageError = useCallback((modelName: string) => {
    setFailedImages((prev) => ({ ...prev, [modelName]: true }))
  }, [])

  // Load nickname from localStorage and listen for changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Clear nickname when user changes or is not authenticated
      if (!user?.id) {
        setNickname('')
        return
      }

      const savedNickname = localStorage.getItem('userNickname')
      if (savedNickname) {
        setNickname(savedNickname)
      }

      // Listen for personalization changes
      const handlePersonalizationChange = (event: CustomEvent) => {
        setNickname(event.detail?.nickname ?? '')
      }

      window.addEventListener(
        'personalizationChanged',
        handlePersonalizationChange as EventListener,
      )

      return () => {
        window.removeEventListener(
          'personalizationChanged',
          handlePersonalizationChange as EventListener,
        )
      }
    }
  }, [user?.id])

  // Determine the greeting text
  const getGreeting = () => {
    if (nickname) {
      return `Hello, ${nickname}!`
    }
    if (user?.firstName) {
      return `Hello, ${user.firstName}!`
    }
    return 'Tinfoil Private Chat'
  }

  // Don't show loading skeleton - show the welcome screen immediately
  // Models will populate when they're loaded

  return (
    <motion.div
      className="w-full"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.6,
        ease: 'easeOut',
        delay: 0.1,
      }}
    >
      <div className="flex w-full justify-center">
        <div className="w-full max-w-2xl">
          <motion.h1
            className="flex items-center gap-3 text-2xl font-medium tracking-tight text-content-primary md:text-3xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.5,
              ease: 'easeOut',
              delay: 0.2,
            }}
          >
            {getGreeting()}
          </motion.h1>

          <div className="mt-8">
            {/* Centered Chat Input - Desktop only */}
            {onSubmit && input !== undefined && setInput && (
              <motion.div
                className="mt-8 hidden md:block"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  duration: 0.5,
                  ease: 'easeOut',
                  delay: 0.4,
                }}
              >
                <ChatInput
                  input={input}
                  setInput={setInput}
                  handleSubmit={onSubmit}
                  loadingState={loadingState ?? 'idle'}
                  cancelGeneration={cancelGeneration ?? (() => {})}
                  inputRef={inputRef ?? fallbackInputRef}
                  handleInputFocus={handleInputFocus ?? (() => {})}
                  inputMinHeight="60px"
                  isDarkMode={isDarkMode}
                  handleDocumentUpload={handleDocumentUpload}
                  processedDocuments={processedDocuments}
                  removeDocument={removeDocument}
                  isPremium={isPremium}
                  hasMessages={false}
                  audioModel={
                    models?.find((m) => m.type === 'audio')?.modelName
                  }
                  modelSelectorButton={
                    models &&
                    selectedModel &&
                    handleModelSelect &&
                    handleLabelClick ? (
                      <div className="relative">
                        <button
                          type="button"
                          data-model-selector
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            if (handleLabelClick) {
                              handleLabelClick('model', () => {})
                            }
                          }}
                          className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-chat-background px-2 py-1 text-xs text-content-secondary transition-colors hover:bg-surface-chat"
                        >
                          {(() => {
                            const model = models.find(
                              (m) => m.modelName === selectedModel,
                            )
                            if (!model) return null
                            return (
                              <>
                                <img
                                  src={
                                    failedImages[model.modelName]
                                      ? '/icon.png'
                                      : model.image === 'openai.png'
                                        ? `/model-icons/openai-${isDarkMode ? 'dark' : 'light'}.png`
                                        : model.image === 'moonshot.png'
                                          ? `/model-icons/moonshot-${isDarkMode ? 'dark' : 'light'}.png`
                                          : `/model-icons/${model.image}`
                                  }
                                  alt={model.name}
                                  className="h-4 w-4"
                                  onError={() =>
                                    handleImageError(model.modelName)
                                  }
                                />
                                <span className="text-xs font-medium text-content-primary">
                                  {model.name}
                                </span>
                                <svg
                                  className="h-3 w-3 text-content-muted"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 9l-7 7-7-7"
                                  />
                                </svg>
                              </>
                            )
                          })()}
                        </button>

                        {expandedLabel === 'model' && handleModelSelect && (
                          <ModelSelector
                            selectedModel={selectedModel}
                            onSelect={handleModelSelect}
                            isDarkMode={isDarkMode}
                            isPremium={isPremium ?? false}
                            models={models}
                            preferredPosition="below"
                            onPremiumModelClick={() => {
                              if (!isSignedIn) {
                                if (handleLabelClick) {
                                  handleLabelClick('model', () => {})
                                }
                                void openSignIn()
                                return
                              }
                              if (setIsSidebarOpen) {
                                setIsSidebarOpen(true)
                                window.dispatchEvent(
                                  new CustomEvent('highlightSidebarBox', {
                                    detail: { isPremium },
                                  }),
                                )
                              }
                            }}
                          />
                        )}
                      </div>
                    ) : undefined
                  }
                />
              </motion.div>
            )}

            {/* Verification Status Display */}
            <motion.div
              className="no-scroll-anchoring mt-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: 0.5,
                ease: 'easeOut',
                delay: 0.5,
              }}
            >
              <VerificationStatusDisplay
                isDarkMode={isDarkMode}
                onOpenVerifier={openAndExpandVerifier}
                verificationDocument={verificationState}
                isCompact={true}
              />
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  )
})
