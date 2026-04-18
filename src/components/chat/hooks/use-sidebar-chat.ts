/**
 * Ephemeral "Ask" sidebar chat hook.
 *
 * Drives a single, disposable streaming session for the quote-ask sidebar.
 * Nothing is persisted — no IndexedDB, no sessionStorage, no cloud sync.
 * Each call to askQuote() aborts the previous stream and starts fresh.
 *
 * Reuses the existing streaming pipeline (sendChatStream +
 * processStreamingResponse) by shimming updateChatWithHistoryCheck with a
 * pure in-memory setter. This keeps the stream parsing, thinking mode,
 * web search, and citation processing identical to the main chat view
 * without duplicating any of that logic.
 */
import { type BaseModel } from '@/config/models'
import { sendChatStream } from '@/services/inference/inference-client'
import { logError } from '@/utils/error-handling'
import { useCallback, useRef, useState } from 'react'
import type { AIModel, LoadingState, Message } from '../types'
import { processStreamingResponse } from './streaming-processor'
import type { ReasoningEffort } from './use-reasoning-effort'

interface UseSidebarChatProps {
  systemPrompt: string
  rules?: string
  models: BaseModel[]
  selectedModel: AIModel
  maxMessages: number
  reasoningEffort?: ReasoningEffort
  webSearchEnabled?: boolean
  piiCheckEnabled?: boolean
}

export interface SidebarChatState {
  messages: Message[]
  quote: string | null
  loadingState: LoadingState
  isThinking: boolean
  isWaitingForResponse: boolean
  isStreaming: boolean
  retryInfo: { attempt: number; maxRetries: number; error?: string } | null
}

interface UseSidebarChatReturn extends SidebarChatState {
  askQuote: (quote: string) => void
  cancel: () => void
  reset: () => void
}

// A stable placeholder chat id used by the streaming processor. The id never
// leaves this hook — nothing is saved under it.
const EPHEMERAL_CHAT_ID = 'ask-sidebar-ephemeral'

export function useSidebarChat({
  systemPrompt,
  rules = '',
  models,
  selectedModel,
  maxMessages,
  reasoningEffort,
  webSearchEnabled,
  piiCheckEnabled,
}: UseSidebarChatProps): UseSidebarChatReturn {
  const [messages, setMessages] = useState<Message[]>([])
  const [quote, setQuote] = useState<string | null>(null)
  const [loadingState, setLoadingState] = useState<LoadingState>('idle')
  const [retryInfo, setRetryInfo] = useState<{
    attempt: number
    maxRetries: number
    error?: string
  } | null>(null)
  const [isThinking, setIsThinking] = useState(false)
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)

  // Refs kept in sync with state so the streaming processor (which captures
  // them once) can read the latest values.
  const isStreamingRef = useRef(false)
  const thinkingStartTimeRef = useRef<number | null>(null)
  const currentChatIdRef = useRef<string>(EPHEMERAL_CHAT_ID)
  const abortControllerRef = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    isStreamingRef.current = false
    thinkingStartTimeRef.current = null
    setLoadingState('idle')
    setRetryInfo(null)
    setIsThinking(false)
    setIsWaitingForResponse(false)
    setIsStreaming(false)
  }, [])

  const reset = useCallback(() => {
    cancel()
    setMessages([])
    setQuote(null)
  }, [cancel])

  const askQuote = useCallback(
    (quoteText: string) => {
      if (!quoteText) return

      // Discard any in-flight stream and any previous sidebar conversation.
      cancel()
      setMessages([])
      setQuote(quoteText)

      const model = models.find((m) => m.modelName === selectedModel)
      if (!model) {
        logError('Cannot start sidebar ask: model not found', undefined, {
          component: 'useSidebarChat',
          metadata: { selectedModel },
        })
        return
      }

      const userMessage: Message = {
        role: 'user',
        content: '',
        quote: quoteText,
        timestamp: new Date(),
      }
      const updatedMessages: Message[] = [userMessage]
      setMessages(updatedMessages)

      const controller = new AbortController()
      abortControllerRef.current = controller
      setLoadingState('loading')
      setIsWaitingForResponse(true)
      setIsStreaming(true)

      // In-memory shim for updateChatWithHistoryCheck. The streaming processor
      // expects (setChats, chatSnapshot, setCurrentChat, chatId, newMessages).
      // We map that onto our single messages state.
      const inMemoryUpdate = (
        _setChats: unknown,
        _chatSnapshot: unknown,
        _setCurrentChat: unknown,
        _chatId: string,
        newMessages: Message[],
      ) => {
        setMessages(newMessages)
      }

      // Minimal Chat-shaped object; only id is really used by the processor.
      const ephemeralChat = {
        id: EPHEMERAL_CHAT_ID,
        title: '',
        messages: updatedMessages,
        createdAt: new Date(),
      }

      ;(async () => {
        try {
          const response = await sendChatStream({
            model,
            systemPrompt,
            rules,
            onRetry: (attempt, max, error) => {
              setLoadingState('retrying')
              setRetryInfo({ attempt, maxRetries: max, error })
            },
            updatedMessages,
            maxMessages,
            signal: controller.signal,
            reasoningEffort,
            webSearchEnabled,
            piiCheckEnabled,
          })

          isStreamingRef.current = true
          const assistantMessage = await processStreamingResponse(response, {
            updatedChat: ephemeralChat as never,
            updatedMessages,
            isFirstMessage: true,
            modelsLength: models.length,
            currentChatIdRef,
            isStreamingRef,
            thinkingStartTimeRef,
            setIsThinking,
            setIsWaitingForResponse,
            setIsStreaming,
            updateChatWithHistoryCheck: inMemoryUpdate as never,
            setChats: (() => {}) as never,
            setCurrentChat: (() => {}) as never,
            setLoadingState: setLoadingState as never,
            storeHistory: false,
            startingChatId: EPHEMERAL_CHAT_ID,
          })

          if (assistantMessage && abortControllerRef.current === controller) {
            setMessages([...updatedMessages, assistantMessage])
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return
          }
          // Ignore errors from a superseded request; the active request owns
          // the visible messages state.
          if (abortControllerRef.current !== controller) {
            return
          }
          logError('Sidebar ask streaming failed', error, {
            component: 'useSidebarChat',
          })
          const errMsg =
            error instanceof Error ? error.message : 'Unknown error'
          setMessages([
            ...updatedMessages,
            {
              role: 'assistant',
              content: `Error: ${errMsg}`,
              timestamp: new Date(),
              isError: true,
            },
          ])
        } finally {
          // Only clear streaming state if this request is still the active one.
          // Otherwise a newer askQuote() call has already taken over the refs
          // and setting them here would stomp on its flags.
          if (abortControllerRef.current === controller) {
            setLoadingState('idle')
            setRetryInfo(null)
            setIsWaitingForResponse(false)
            setIsStreaming(false)
            isStreamingRef.current = false
            thinkingStartTimeRef.current = null
            abortControllerRef.current = null
          }
        }
      })()
    },
    [
      cancel,
      models,
      selectedModel,
      systemPrompt,
      rules,
      maxMessages,
      reasoningEffort,
      webSearchEnabled,
      piiCheckEnabled,
    ],
  )

  return {
    messages,
    quote,
    loadingState,
    retryInfo,
    isThinking,
    isWaitingForResponse,
    isStreaming,
    askQuote,
    cancel,
    reset,
  }
}
