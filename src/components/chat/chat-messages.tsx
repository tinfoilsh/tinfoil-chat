'use client'

import { type BaseModel } from '@/app/config/models'
import { useUser } from '@clerk/nextjs'
import { motion } from 'framer-motion'
import 'katex/dist/katex.min.css'
import React, { memo, useEffect, useMemo, useState } from 'react'
import { LoadingDots } from '../loading-dots'
import { ChatInput } from './chat-input'
import { useMaxMessages } from './hooks/use-max-messages'
import { ModelSelector } from './model-selector'
import { DefaultMessageRenderer, getRendererRegistry } from './renderers/client'
import type { Message } from './types'
import { VerificationStatusDisplay } from './verification-status-display'

type ChatMessagesProps = {
  messages: Message[]
  isDarkMode: boolean
  chatId: string
  messagesEndRef: React.RefObject<HTMLDivElement>
  openAndExpandVerifier: () => void
  isWaitingForResponse?: boolean
  isPremium?: boolean
  models?: BaseModel[]
  subscriptionLoading?: boolean
  verificationState?: any
  onSubmit?: (e: React.FormEvent) => void
  input?: string
  setInput?: (value: string) => void
  loadingState?: any
  cancelGeneration?: () => void
  inputRef?: React.RefObject<HTMLTextAreaElement>
  handleInputFocus?: () => void
  handleDocumentUpload?: (file: File) => Promise<void>
  processedDocuments?: any[]
  removeDocument?: (id: string) => void
  selectedModel?: string
  handleModelSelect?: (model: string) => void
  expandedLabel?: string | null
  handleLabelClick?: (
    label: 'verify' | 'model' | 'info',
    action: () => void,
  ) => void
}

// Simple wrapper component that uses the renderer
const ChatMessage = memo(function ChatMessage({
  message,
  model,
  isDarkMode,
  isLastMessage = false,
  isStreaming = false,
  expandedThoughtsState,
  setExpandedThoughtsState,
}: {
  message: Message
  model?: BaseModel | null
  isDarkMode: boolean
  isLastMessage?: boolean
  isStreaming?: boolean
  expandedThoughtsState?: Record<string, boolean>
  setExpandedThoughtsState?: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >
}) {
  // Get renderer from registry if model is provided
  // Always ensure we have a proper renderer, not the minimal fallback
  let renderer = DefaultMessageRenderer

  if (model) {
    const registryRenderer = getRendererRegistry().getMessageRenderer(
      message,
      model,
    )
    // Only use registry renderer if it's not the minimal fallback
    if (registryRenderer.id !== 'fallback') {
      renderer = registryRenderer
    }
  }

  const RendererComponent = renderer.render

  return (
    <RendererComponent
      message={message}
      model={model || ({ modelName: 'default' } as BaseModel)}
      isDarkMode={isDarkMode}
      isLastMessage={isLastMessage}
      isStreaming={isStreaming}
      expandedThoughtsState={expandedThoughtsState}
      setExpandedThoughtsState={setExpandedThoughtsState}
    />
  )
})

// Add a new component for the loading state
const LoadingMessage = memo(function LoadingMessage({
  isDarkMode,
}: {
  isDarkMode: boolean
}) {
  return (
    <div className="group mb-6 flex w-full flex-col items-start">
      <div className="w-full px-4 py-2">
        {/* Container with minimum height to prevent layout shift */}
        {/* Matches the typical height of a single line of text response */}
        <div className="flex min-h-[28px] items-center">
          <LoadingDots isThinking={false} isDarkMode={isDarkMode} />
        </div>
      </div>
    </div>
  )
})

export const scrollToBottom = (
  messagesEndRef: React.RefObject<HTMLDivElement>,
  behavior: ScrollBehavior = 'smooth',
) => {
  messagesEndRef.current?.scrollIntoView({ behavior })
}

// Welcome screen component to reduce renders
const WelcomeScreen = memo(function WelcomeScreen({
  isDarkMode,
  openAndExpandVerifier,
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
}: {
  isDarkMode: boolean
  openAndExpandVerifier: () => void
  isPremium?: boolean
  models?: BaseModel[]
  subscriptionLoading?: boolean
  verificationState?: any
  onSubmit?: (e: React.FormEvent) => void
  input?: string
  setInput?: (value: string) => void
  loadingState?: any
  cancelGeneration?: () => void
  inputRef?: React.RefObject<HTMLTextAreaElement>
  handleInputFocus?: () => void
  handleDocumentUpload?: (file: File) => Promise<void>
  processedDocuments?: any[]
  removeDocument?: (id: string) => void
  selectedModel?: string
  handleModelSelect?: (model: string) => void
  expandedLabel?: string | null
  handleLabelClick?: (
    label: 'verify' | 'model' | 'info',
    action: () => void,
  ) => void
}) {
  const { user } = useUser()
  const [nickname, setNickname] = useState<string>('')

  // Load nickname from localStorage and listen for changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedNickname = localStorage.getItem('userNickname')
      if (savedNickname) {
        setNickname(savedNickname)
      }

      // Listen for personalization changes
      const handlePersonalizationChange = (event: CustomEvent) => {
        setNickname(event.detail.nickname || '')
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
  }, [])

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

  // Show loading state while subscription is loading
  if (subscriptionLoading) {
    return (
      <div className="w-full animate-pulse">
        <div
          className={`mb-6 h-9 rounded-lg bg-gradient-to-r ${
            isDarkMode
              ? 'from-gray-700 to-gray-600'
              : 'from-gray-200 to-gray-300'
          }`}
        />

        <div className="space-y-4">
          {[1, 2, 3].map((index) => (
            <div key={index} className="flex items-start gap-3">
              <div
                className={`mt-1 h-5 w-5 flex-shrink-0 rounded bg-gradient-to-r ${
                  isDarkMode
                    ? 'from-gray-700 to-gray-600'
                    : 'from-gray-200 to-gray-300'
                }`}
              />
              <div
                className={`h-5 flex-1 rounded bg-gradient-to-r ${
                  isDarkMode
                    ? 'from-gray-700 to-gray-600'
                    : 'from-gray-200 to-gray-300'
                }`}
              />
            </div>
          ))}
        </div>

        <div className="mt-12">
          <div
            className={`mb-4 h-6 w-64 rounded bg-gradient-to-r ${
              isDarkMode
                ? 'from-gray-700 to-gray-600'
                : 'from-gray-200 to-gray-300'
            }`}
          />
          <div className="space-y-3">
            {[1, 2].map((index) => (
              <div key={index} className="flex items-center gap-3">
                <div
                  className={`h-4 w-4 flex-shrink-0 rounded bg-gradient-to-r ${
                    isDarkMode
                      ? 'from-gray-700 to-gray-600'
                      : 'from-gray-200 to-gray-300'
                  }`}
                />
                <div
                  className={`h-4 w-32 rounded bg-gradient-to-r ${
                    isDarkMode
                      ? 'from-gray-700 to-gray-600'
                      : 'from-gray-200 to-gray-300'
                  }`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

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
      <div className="w-full">
        <div className="grid grid-cols-1 items-start">
          <motion.h1
            className={`flex items-center gap-3 text-2xl font-medium tracking-tight md:text-3xl ${
              isDarkMode ? 'text-gray-100' : 'text-gray-800'
            }`}
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

          <div className="mt-4 md:mt-8">
            <motion.p
              className={`${isDarkMode ? 'text-gray-300' : 'text-gray-600'} text-lg`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: 0.5,
                ease: 'easeOut',
                delay: 0.3,
              }}
            >
              This conversation is private: nobody can see your messages.
            </motion.p>
            <motion.p
              className={`${isDarkMode ? 'text-gray-400' : 'text-gray-500'} mt-1 text-sm leading-6`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: 0.5,
                ease: 'easeOut',
                delay: 0.3,
              }}
            >
              Each message is end‑to‑end encrypted and <em>only</em> processed
              inside secure hardware enclaves.
            </motion.p>

            {/* Model Selector - Desktop only */}
            {isPremium && models && selectedModel && handleModelSelect && (
              <motion.div
                className="mt-8 hidden md:block"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  duration: 0.5,
                  ease: 'easeOut',
                  delay: 0.35,
                }}
              >
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
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                      isDarkMode
                        ? 'bg-gray-700 hover:bg-gray-600'
                        : 'bg-gray-100 hover:bg-gray-200'
                    } transition-colors`}
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
                              model.modelName
                                .toLowerCase()
                                .includes('openai') ||
                              model.modelName.toLowerCase().includes('gpt')
                                ? isDarkMode
                                  ? '/model-icons/openai-dark.png'
                                  : '/model-icons/openai-light.png'
                                : model.image
                            }
                            alt={model.name}
                            className="h-5 w-5"
                          />
                          <span
                            className={`text-sm font-medium ${
                              isDarkMode ? 'text-gray-200' : 'text-gray-700'
                            }`}
                          >
                            {model.name}
                          </span>
                          <svg
                            className={`h-4 w-4 ${
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
                      isPremium={isPremium}
                      models={models}
                      preferredPosition="below"
                    />
                  )}
                </div>
              </motion.div>
            )}

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
                  loadingState={loadingState}
                  cancelGeneration={cancelGeneration || (() => {})}
                  inputRef={inputRef || React.createRef()}
                  handleInputFocus={handleInputFocus || (() => {})}
                  inputMinHeight="28px"
                  isDarkMode={isDarkMode}
                  handleDocumentUpload={handleDocumentUpload}
                  processedDocuments={processedDocuments}
                  removeDocument={removeDocument}
                  isPremium={isPremium}
                  hasMessages={false}
                />
              </motion.div>
            )}

            {/* Verification Status Display - Compact mode on all screen sizes */}
            <div className="mt-4 md:mt-8">
              <VerificationStatusDisplay
                isDarkMode={isDarkMode}
                onOpenVerifier={openAndExpandVerifier}
                verificationState={verificationState}
                isCompact={true}
              />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
})

// Separator component
const MessagesSeparator = memo(function MessagesSeparator({
  isDarkMode,
}: {
  isDarkMode: boolean
}) {
  return (
    <div className={`relative my-6 flex items-center justify-center`}>
      <div
        className={`absolute w-full border-t ${isDarkMode ? 'border-gray-800' : 'border-gray-300'}`}
      ></div>
      <span
        className={`relative px-4 ${isDarkMode ? 'bg-gray-900 text-gray-400' : 'bg-white text-gray-500'} text-sm font-medium`}
      >
        Archived Messages
      </span>
    </div>
  )
})

export function ChatMessages({
  messages,
  isDarkMode,
  chatId,
  messagesEndRef,
  openAndExpandVerifier,
  isWaitingForResponse = false,
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
}: ChatMessagesProps) {
  const [mounted, setMounted] = useState(false)
  const [expandedThoughtsState, setExpandedThoughtsState] = useState<
    Record<string, boolean>
  >({})
  const maxMessages = useMaxMessages()

  // Get the current model
  const currentModel = useMemo(() => {
    if (!models || !selectedModel) return null
    return models.find((m) => m.modelName === selectedModel)
  }, [models, selectedModel])

  // Separate messages into archived and live sections - memoize this calculation
  const { archivedMessages, liveMessages } = useMemo(() => {
    const archived =
      messages.length > maxMessages ? messages.slice(0, -maxMessages) : []
    const live =
      messages.length > maxMessages ? messages.slice(-maxMessages) : messages
    return { archivedMessages: archived, liveMessages: live }
  }, [messages, maxMessages])

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="h-full">
        <div ref={messagesEndRef} />
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{
          height: '100%',
          position: 'relative',
        }}
      >
        <div className="w-full max-w-4xl px-8">
          <WelcomeScreen
            isDarkMode={isDarkMode}
            openAndExpandVerifier={openAndExpandVerifier}
            isPremium={isPremium}
            models={models}
            subscriptionLoading={subscriptionLoading}
            verificationState={verificationState}
            onSubmit={onSubmit}
            input={input}
            setInput={setInput}
            loadingState={loadingState}
            cancelGeneration={cancelGeneration}
            inputRef={inputRef}
            handleInputFocus={handleInputFocus}
            handleDocumentUpload={handleDocumentUpload}
            processedDocuments={processedDocuments}
            removeDocument={removeDocument}
            selectedModel={selectedModel}
            handleModelSelect={handleModelSelect}
            expandedLabel={expandedLabel}
            handleLabelClick={handleLabelClick}
          />
        </div>
        <div ref={messagesEndRef} className="hidden" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-24">
      {/* Archived Messages - only shown if there are more than the max prompt messages */}
      {archivedMessages.length > 0 && (
        <>
          <div className={`opacity-70`}>
            {archivedMessages.map((message, i) => (
              <ChatMessage
                key={`archived-${i}`}
                message={message}
                model={currentModel}
                isDarkMode={isDarkMode}
                isLastMessage={false}
                isStreaming={false}
                expandedThoughtsState={expandedThoughtsState}
                setExpandedThoughtsState={setExpandedThoughtsState}
              />
            ))}
          </div>

          {/* Separator */}
          <MessagesSeparator isDarkMode={isDarkMode} />
        </>
      )}

      {/* Live Messages - the last messages up to max prompt limit */}
      {liveMessages.map((message, i) => (
        <ChatMessage
          key={`${chatId}-${i}`}
          message={message}
          model={currentModel}
          isDarkMode={isDarkMode}
          isLastMessage={i === liveMessages.length - 1}
          isStreaming={i === liveMessages.length - 1 && isWaitingForResponse}
          expandedThoughtsState={expandedThoughtsState}
          setExpandedThoughtsState={setExpandedThoughtsState}
        />
      ))}
      {isWaitingForResponse && <LoadingMessage isDarkMode={isDarkMode} />}
      <div ref={messagesEndRef} />
    </div>
  )
}
