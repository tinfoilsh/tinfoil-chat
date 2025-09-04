'use client'

import { type BaseModel } from '@/app/config/models'
import 'katex/dist/katex.min.css'
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { LoadingDots } from '../loading-dots'
import { useMaxMessages } from './hooks/use-max-messages'
import { getRendererRegistry } from './renderers/client'
import type { LabelType, Message } from './types'
import { WelcomeScreen } from './WelcomeScreen'

type ChatMessagesProps = {
  messages: Message[]
  isDarkMode: boolean
  chatId: string
  messagesEndRef?: React.RefObject<HTMLDivElement>
  openAndExpandVerifier: () => void
  setIsSidebarOpen?: (isOpen: boolean) => void
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
  expandedLabel?: LabelType
  handleLabelClick?: (
    label: 'verify' | 'model' | 'info',
    action: () => void,
  ) => void
}

// Optimized wrapper component that receives expanded state from parent
const ChatMessage = memo(
  function ChatMessage({
    message,
    model,
    isDarkMode,
    isLastMessage = false,
    isStreaming = false,
    expandedThoughtsState,
    setExpandedThoughtsState,
  }: {
    message: Message
    model: BaseModel
    isDarkMode: boolean
    isLastMessage?: boolean
    isStreaming?: boolean
    expandedThoughtsState: Record<string, boolean>
    setExpandedThoughtsState: React.Dispatch<
      React.SetStateAction<Record<string, boolean>>
    >
  }) {
    // Get renderer from registry
    const renderer = getRendererRegistry().getMessageRenderer(message, model)

    const RendererComponent = renderer.render

    return (
      <RendererComponent
        message={message}
        model={model}
        isDarkMode={isDarkMode}
        isLastMessage={isLastMessage}
        isStreaming={isStreaming}
        expandedThoughtsState={expandedThoughtsState}
        setExpandedThoughtsState={setExpandedThoughtsState}
      />
    )
  },
  (prevProps, nextProps) => {
    // Custom comparison to prevent unnecessary re-renders

    // Generate stable message IDs for expanded state comparison
    const getMessageId = (message: Message) => {
      const timestamp = message.timestamp
        ? message.timestamp instanceof Date
          ? message.timestamp.getTime()
          : String(message.timestamp)
        : 'no-timestamp'
      return `${message.role}-${timestamp}`
    }

    const messageId = getMessageId(nextProps.message)
    const prevExpanded = prevProps.expandedThoughtsState[messageId] ?? false
    const nextExpanded = nextProps.expandedThoughtsState[messageId] ?? false

    // Always re-render if this is the streaming message and content/thoughts changed
    if (nextProps.isStreaming && nextProps.isLastMessage) {
      // Only re-render if content, thoughts, or expanded state actually changed
      return (
        prevProps.message.content === nextProps.message.content &&
        prevProps.message.thoughts === nextProps.message.thoughts &&
        prevProps.message.isThinking === nextProps.message.isThinking &&
        prevExpanded === nextExpanded
      )
    }

    // For messages with thinking, be more careful about re-renders
    if (prevProps.message.isThinking || nextProps.message.isThinking) {
      // Only re-render if the actual message content or thinking state changed
      return (
        prevProps.message.content === nextProps.message.content &&
        prevProps.message.thoughts === nextProps.message.thoughts &&
        prevProps.message.isThinking === nextProps.message.isThinking &&
        prevProps.message.documentContent ===
          nextProps.message.documentContent &&
        prevProps.message.documents === nextProps.message.documents &&
        prevProps.message.imageData === nextProps.message.imageData &&
        prevProps.model === nextProps.model &&
        prevProps.isDarkMode === nextProps.isDarkMode &&
        prevProps.isLastMessage === nextProps.isLastMessage &&
        prevProps.isStreaming === nextProps.isStreaming &&
        prevExpanded === nextExpanded
      )
    }

    // Default comparison for non-streaming, non-thinking messages
    // Note: documentContent, documents, and imageData are immutable after message creation
    // but we include them for completeness and to handle any edge cases
    return (
      prevProps.message.content === nextProps.message.content &&
      prevProps.message.thoughts === nextProps.message.thoughts &&
      prevProps.message.documentContent === nextProps.message.documentContent &&
      prevProps.message.documents === nextProps.message.documents &&
      prevProps.message.imageData === nextProps.message.imageData &&
      prevProps.model === nextProps.model &&
      prevProps.isDarkMode === nextProps.isDarkMode &&
      prevProps.isLastMessage === nextProps.isLastMessage &&
      prevProps.isStreaming === nextProps.isStreaming &&
      prevExpanded === nextExpanded &&
      prevProps.setExpandedThoughtsState === nextProps.setExpandedThoughtsState
    )
  },
)

// Loading indicator with EXACT same structure as collapsed ThoughtProcess
const LoadingMessage = memo(function LoadingMessage({
  isDarkMode,
}: {
  isDarkMode: boolean
}) {
  return (
    <div className="no-scroll-anchoring group mb-6 flex w-full flex-col items-start">
      <div className="w-full px-4 py-2">
        <div className="mb-2 w-full">
          {/* EXACT same structure as ThoughtProcess container */}
          <div className={`mb-2 mt-2 rounded-lg bg-transparent`}>
            <div
              className={`flex h-10 w-full items-center justify-between px-4 text-left ${
                isDarkMode ? 'text-gray-200' : 'text-gray-700'
              } rounded-lg`}
            >
              <div className="flex items-center gap-2">
                <LoadingDots isThinking={false} isDarkMode={isDarkMode} />
              </div>
              {/* Empty div for the chevron space to match layout */}
              <div className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

// Helper to generate unique message keys
const getMessageKey = (
  prefix: string,
  message: Message,
  index: number,
): string => {
  // Use role and timestamp for stable unique keys (no index to avoid reordering issues)
  const timestamp = message.timestamp
    ? message.timestamp instanceof Date
      ? message.timestamp.getTime()
      : String(message.timestamp)
    : `fallback-${index}` // Only use index as fallback when no timestamp
  return `${prefix}-${message.role}-${timestamp}`
}

// Removed duplicate WelcomeScreen component - using imported version from './WelcomeScreen'
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
  openAndExpandVerifier,
  setIsSidebarOpen,
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

  // Memoize the setter to prevent function reference changes
  const memoizedSetExpandedThoughtsState = useCallback(
    (updater: React.SetStateAction<Record<string, boolean>>) => {
      setExpandedThoughtsState(updater)
    },
    [],
  )

  // Get the current model - always defined since config must load
  const currentModel = useMemo(() => {
    if (!models || models.length === 0 || !selectedModel) {
      // This should never happen since chat interface doesn't load without config
      // but TypeScript needs this check
      return models?.[0] || null
    }
    return models.find((m) => m.modelName === selectedModel) || models[0]
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
    return <div className="h-full"></div>
  }

  if (messages.length === 0) {
    return (
      <div className="flex w-full flex-1 items-center justify-center">
        <div className="w-full max-w-4xl px-8">
          <WelcomeScreen
            isDarkMode={isDarkMode}
            openAndExpandVerifier={openAndExpandVerifier}
            setIsSidebarOpen={setIsSidebarOpen}
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
            expandedLabel={expandedLabel as LabelType}
            handleLabelClick={handleLabelClick}
          />
        </div>
      </div>
    )
  }

  // Early return if no model (should never happen)
  if (!currentModel) {
    return <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-24"></div>
  }

  // Show loading dots only if waiting and no assistant thinking message exists yet
  const lastMessage = liveMessages[liveMessages.length - 1]
  const hasAssistantThinking = Boolean(
    lastMessage &&
      lastMessage.role === 'assistant' &&
      (lastMessage.isThinking ||
        (lastMessage.thoughts && !lastMessage.content)),
  )
  const showLoadingPlaceholder = isWaitingForResponse && !hasAssistantThinking

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-24">
      {/* Archived Messages - only shown if there are more than the max prompt messages */}
      {archivedMessages.length > 0 && (
        <>
          <div className={`opacity-70`}>
            {archivedMessages.map((message, i) => (
              <ChatMessage
                key={getMessageKey(`${chatId}-archived`, message, i)}
                message={message}
                model={currentModel}
                isDarkMode={isDarkMode}
                isLastMessage={false}
                isStreaming={false}
                expandedThoughtsState={expandedThoughtsState}
                setExpandedThoughtsState={memoizedSetExpandedThoughtsState}
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
          key={getMessageKey(`${chatId}-live`, message, i)}
          message={message}
          model={currentModel}
          isDarkMode={isDarkMode}
          isLastMessage={i === liveMessages.length - 1}
          isStreaming={i === liveMessages.length - 1 && isWaitingForResponse}
          expandedThoughtsState={expandedThoughtsState}
          setExpandedThoughtsState={memoizedSetExpandedThoughtsState}
        />
      ))}
      {showLoadingPlaceholder && <LoadingMessage isDarkMode={isDarkMode} />}
    </div>
  )
}
