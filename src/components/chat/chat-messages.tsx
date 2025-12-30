import { type BaseModel } from '@/config/models'
import { useChatPrint } from '@/hooks/use-chat-print'
import 'katex/dist/katex.min.css'
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { LoadingDots } from '../loading-dots'
import { useMaxMessages } from './hooks/use-max-messages'
import { PrintableChat } from './PrintableChat'
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
  isStreamingResponse?: boolean
  isPremium?: boolean
  models?: BaseModel[]
  subscriptionLoading?: boolean
  verificationState?: any
  onSubmit?: (e: React.FormEvent) => void
  input?: string
  setInput?: (value: string) => void
  loadingState?: any
  retryInfo?: { attempt: number; maxRetries: number; error?: string } | null
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
    label: Exclude<LabelType, null>,
    action: () => void,
  ) => void
  onEditMessage?: (messageIndex: number, newContent: string) => void
  onRegenerateMessage?: (messageIndex: number) => void
  showScrollButton?: boolean
  webSearchEnabled?: boolean
  onWebSearchToggle?: () => void
}

// Optimized wrapper component that receives expanded state from parent
const ChatMessage = memo(
  function ChatMessage({
    message,
    messageIndex,
    model,
    isDarkMode,
    isLastMessage = false,
    isStreaming = false,
    expandedThoughtsState,
    setExpandedThoughtsState,
    titleModelName,
    onEditMessage,
    onRegenerateMessage,
  }: {
    message: Message
    messageIndex: number
    model: BaseModel
    isDarkMode: boolean
    isLastMessage?: boolean
    isStreaming?: boolean
    expandedThoughtsState: Record<string, boolean>
    setExpandedThoughtsState: React.Dispatch<
      React.SetStateAction<Record<string, boolean>>
    >
    titleModelName?: string
    onEditMessage?: (messageIndex: number, newContent: string) => void
    onRegenerateMessage?: (messageIndex: number) => void
  }) {
    // Get renderer from registry
    const renderer = getRendererRegistry().getMessageRenderer(message, model)

    const RendererComponent = renderer.render

    return (
      <RendererComponent
        message={message}
        messageIndex={messageIndex}
        model={model}
        isDarkMode={isDarkMode}
        isLastMessage={isLastMessage}
        isStreaming={isStreaming}
        expandedThoughtsState={expandedThoughtsState}
        setExpandedThoughtsState={setExpandedThoughtsState}
        titleModelName={titleModelName}
        onEditMessage={onEditMessage}
        onRegenerateMessage={onRegenerateMessage}
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
        prevExpanded === nextExpanded &&
        prevProps.titleModelName === nextProps.titleModelName
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
        prevExpanded === nextExpanded &&
        prevProps.titleModelName === nextProps.titleModelName
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
      prevProps.messageIndex === nextProps.messageIndex &&
      prevProps.model === nextProps.model &&
      prevProps.isDarkMode === nextProps.isDarkMode &&
      prevProps.isLastMessage === nextProps.isLastMessage &&
      prevProps.isStreaming === nextProps.isStreaming &&
      prevExpanded === nextExpanded &&
      prevProps.setExpandedThoughtsState ===
        nextProps.setExpandedThoughtsState &&
      prevProps.titleModelName === nextProps.titleModelName &&
      prevProps.onEditMessage === nextProps.onEditMessage &&
      prevProps.onRegenerateMessage === nextProps.onRegenerateMessage
    )
  },
)

// Loading indicator with EXACT same structure as collapsed ThoughtProcess
const LoadingMessage = memo(function LoadingMessage({
  isDarkMode,
  isRetrying = false,
  retryInfo,
}: {
  isDarkMode: boolean
  isRetrying?: boolean
  retryInfo?: { attempt: number; maxRetries: number; error?: string } | null
}) {
  const getRetryMessage = () => {
    if (!retryInfo) return 'Connection issue. Retrying...'

    const { attempt, maxRetries, error } = retryInfo
    let errorType = 'Connection issue'

    if (error) {
      const lowerError = error.toLowerCase()
      if (lowerError.includes('network') || lowerError.includes('fetch')) {
        errorType = 'Network error'
      } else if (
        lowerError.includes('timeout') ||
        lowerError.includes('timed out')
      ) {
        errorType = 'Request timeout'
      } else if (lowerError.includes('rate limit') || error.includes('429')) {
        errorType = 'Rate limited'
      } else if (lowerError.includes('server') || error.includes('500')) {
        errorType = 'Server error'
      }
    }

    return `${errorType}. Attempting retry (${attempt} of ${maxRetries})...`
  }

  return (
    <div className="no-scroll-anchoring group mb-6 flex w-full flex-col items-start px-4">
      <div className="flex items-center gap-3">
        <LoadingDots isThinking={false} />
        {isRetrying && (
          <span className="text-sm text-content-secondary">
            {getRetryMessage()}
          </span>
        )}
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
      <div className="absolute w-full border-t border-border-subtle"></div>
      <span className="relative bg-surface-chat-background px-4 text-sm font-medium text-content-secondary">
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
  isStreamingResponse = false,
  isPremium,
  models,
  subscriptionLoading,
  verificationState,
  onSubmit,
  input,
  setInput,
  loadingState,
  retryInfo,
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
  onEditMessage,
  onRegenerateMessage,
  showScrollButton,
  webSearchEnabled,
  onWebSearchToggle,
}: ChatMessagesProps) {
  const [mounted, setMounted] = useState(false)
  const [expandedThoughtsState, setExpandedThoughtsState] = useState<
    Record<string, boolean>
  >({})
  const maxMessages = useMaxMessages()
  const [showSpacer, setShowSpacer] = useState(false)
  const prevMessageCountRef = React.useRef(messages.length)
  const prevShowScrollButtonRef = React.useRef(showScrollButton)
  const messageCountWhenSpacerSetRef = React.useRef<number | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  useChatPrint({
    printRef,
    enabled: messages.length > 0,
  })

  // Show spacer when user sends a new message
  React.useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    if (
      messages.length > prevMessageCountRef.current &&
      lastMessage?.role === 'user'
    ) {
      setShowSpacer(true)
      messageCountWhenSpacerSetRef.current = messages.length
    }
    prevMessageCountRef.current = messages.length
  }, [messages])

  // Reset spacer when chat changes
  React.useEffect(() => {
    setShowSpacer(false)
    prevMessageCountRef.current = messages.length
    messageCountWhenSpacerSetRef.current = null
  }, [chatId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset spacer when scroll-to-bottom button appears (user scrolled up)
  React.useEffect(() => {
    const buttonJustAppeared =
      showScrollButton && !prevShowScrollButtonRef.current
    const spacerSetForCurrentMessage =
      messageCountWhenSpacerSetRef.current === messages.length

    // Only reset if button transitioned to visible and we're not on the same message that triggered the spacer
    if (buttonJustAppeared && !spacerSetForCurrentMessage) {
      setShowSpacer(false)
    }
    prevShowScrollButtonRef.current = showScrollButton
  }, [showScrollButton, messages.length])

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

  const titleModelName = useMemo(() => {
    const titleModel = models?.find((m) => m.type === 'title')
    return titleModel?.modelName
  }, [models])

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

  if (messages.length === 0 && !isWaitingForResponse) {
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
            webSearchEnabled={webSearchEnabled}
            onWebSearchToggle={onWebSearchToggle}
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
    <div className="mx-auto w-full min-w-0 max-w-3xl px-4 pb-6 pt-24">
      {/* Archived Messages - only shown if there are more than the max prompt messages */}
      {archivedMessages.length > 0 && (
        <>
          <div className={`opacity-70`}>
            {archivedMessages.map((message, i) => (
              <ChatMessage
                key={getMessageKey(`${chatId}-archived`, message, i)}
                message={message}
                messageIndex={i}
                model={currentModel}
                isDarkMode={isDarkMode}
                isLastMessage={false}
                isStreaming={false}
                expandedThoughtsState={expandedThoughtsState}
                setExpandedThoughtsState={memoizedSetExpandedThoughtsState}
                titleModelName={titleModelName}
                onEditMessage={onEditMessage}
                onRegenerateMessage={onRegenerateMessage}
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
          messageIndex={archivedMessages.length + i}
          model={currentModel}
          isDarkMode={isDarkMode}
          isLastMessage={i === liveMessages.length - 1}
          isStreaming={i === liveMessages.length - 1 && isStreamingResponse}
          expandedThoughtsState={expandedThoughtsState}
          setExpandedThoughtsState={memoizedSetExpandedThoughtsState}
          titleModelName={titleModelName}
          onEditMessage={onEditMessage}
          onRegenerateMessage={onRegenerateMessage}
        />
      ))}
      {showLoadingPlaceholder && (
        <LoadingMessage
          isDarkMode={isDarkMode}
          isRetrying={loadingState === 'retrying'}
          retryInfo={retryInfo}
        />
      )}
      {/* Spacer allows scrollIntoView to bring user message to top of viewport */}
      {showSpacer && (
        <div
          data-spacer
          className="h-[70vh] flex-shrink-0"
          aria-hidden="true"
        />
      )}
      <PrintableChat messages={messages} printRef={printRef} />
    </div>
  )
}
