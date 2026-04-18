/**
 * Streaming processor — Vercel AI SDK edition.
 *
 * Consumes a `streamText` `ChatStreamHandle` and drives a single assistant
 * turn. Responsibilities:
 * - Forward text deltas and reasoning deltas into the assistant message.
 * - Accumulate tool-call deltas so the GenUI renderer sees them live.
 * - Surface Tinfoil-specific sidechannel events (web search progress, URL
 *   fetches, URL citations, search_reasoning) onto the message.
 * - Track chat identity, "waiting for response" / thinking flags, and
 *   persisted chat state.
 *
 * UI writes are batched via rAF/setTimeout to avoid layout thrash. Persistence
 * always goes through `updateChatWithHistoryCheck`.
 */
import { streamingTracker } from '@/services/cloud/streaming-tracker'
import type { ChatStreamHandle } from '@/services/inference/inference-client'
import { processCitationMarkers } from '@/utils/citation-processing'
import { logError } from '@/utils/error-handling'
import type {
  Annotation,
  Chat,
  Message,
  URLFetchState,
  WebSearchSource,
  WebSearchState,
} from '../types'

export interface StreamingContext {
  updatedChat: Chat
  updatedMessages: Message[]
  isFirstMessage: boolean
  modelsLength: number
  currentChatIdRef: React.MutableRefObject<string>
  isStreamingRef: React.MutableRefObject<boolean>
  thinkingStartTimeRef: React.MutableRefObject<number | null>
  setIsThinking: (val: boolean) => void
  setIsWaitingForResponse: (val: boolean) => void
  setIsStreaming: (val: boolean) => void
  updateChatWithHistoryCheck: (
    setChats: React.Dispatch<React.SetStateAction<Chat[]>>,
    chatSnapshot: Chat,
    setCurrentChat: React.Dispatch<React.SetStateAction<Chat>>,
    chatId: string,
    newMessages: Message[],
    skipCloudSync?: boolean,
    skipIndexedDBSave?: boolean,
  ) => void
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>
  setCurrentChat: React.Dispatch<React.SetStateAction<Chat>>
  setLoadingState: (s: 'idle' | 'loading') => void
  storeHistory: boolean
  startingChatId: string
}

export interface StreamingHandlers {
  onAssistantMessageReady: (
    assistantMessage: Message,
    finalMessages: Message[],
  ) => Promise<void>
}

export function getThinkingDuration(
  thinkingStartTimeRef: React.MutableRefObject<number | null>,
) {
  const duration = thinkingStartTimeRef.current
    ? (Date.now() - thinkingStartTimeRef.current) / 1000
    : undefined
  thinkingStartTimeRef.current = null
  return duration
}

/**
 * Drives one assistant response from a Vercel AI SDK stream handle.
 * Returns the final assistant message (with content, thoughts, tool calls,
 * web-search state, URL fetches, and annotations populated).
 */
export async function processStreamingResponse(
  handle: ChatStreamHandle,
  ctx: StreamingContext,
): Promise<Message | null> {
  let assistantMessage: Message = {
    role: 'assistant',
    content: '',
    timestamp: new Date(),
  }

  const streamingChatId = ctx.updatedChat.id
  let rafId: number | ReturnType<typeof setTimeout> | null = null
  const startingChatId = ctx.startingChatId

  const isSameChat = () => ctx.currentChatIdRef.current === startingChatId

  let collectedSources: WebSearchSource[] = []
  let collectedAnnotations: Annotation[] = []
  let urlFetches: URLFetchState[] = []
  let webSearchState: WebSearchState | undefined = undefined
  let thinkingStarted = false
  let searchReasoning = ''

  const toolCallsInProgress = new Map<
    string,
    { id: string; name: string; arguments: string; input?: unknown }
  >()

  const getMessageWithCitations = (): Message => {
    if (assistantMessage.content && collectedSources.length > 0) {
      return {
        ...assistantMessage,
        content: processCitationMarkers(
          assistantMessage.content,
          collectedSources,
        ),
      }
    }
    return assistantMessage
  }

  const commit = (messageToSave: Message) => {
    if (!isSameChat()) return
    const chatId = ctx.currentChatIdRef.current
    const newMessages = [...ctx.updatedMessages, messageToSave]
    ctx.updateChatWithHistoryCheck(
      ctx.setChats,
      { ...ctx.updatedChat, id: chatId },
      ctx.setCurrentChat,
      chatId,
      newMessages,
      false,
      true, // Skip IndexedDB save during streaming
    )
  }

  const scheduleStreamingUpdate = () => {
    if (rafId !== null) return
    const run = () => {
      rafId = null
      commit(getMessageWithCitations())
    }
    if (
      typeof window !== 'undefined' &&
      typeof window.requestAnimationFrame === 'function'
    ) {
      rafId = window.requestAnimationFrame(run)
    } else {
      rafId = setTimeout(run, 16)
    }
  }

  const cancelScheduled = () => {
    if (rafId === null) return
    if (
      typeof window !== 'undefined' &&
      typeof window.cancelAnimationFrame === 'function' &&
      typeof rafId === 'number'
    ) {
      window.cancelAnimationFrame(rafId)
    } else {
      clearTimeout(rafId as ReturnType<typeof setTimeout>)
    }
    rafId = null
  }

  // Drop "waiting for response" the first time we see any stream activity.
  let firstActivitySeen = false
  const markFirstActivity = () => {
    if (firstActivitySeen) return
    firstActivitySeen = true
    if (!isSameChat()) return
    if (
      typeof window !== 'undefined' &&
      typeof window.requestAnimationFrame === 'function'
    ) {
      window.requestAnimationFrame(() => ctx.setIsWaitingForResponse(false))
    } else {
      setTimeout(() => ctx.setIsWaitingForResponse(false), 16)
    }
  }

  // Subscribe to the Tinfoil sidechannel for web_search / url_fetch /
  // url_citation / search_reasoning events.
  const unsubscribe = handle.sidechannel.subscribe((event) => {
    try {
      if (event.type === 'web_search_call') {
        const searchQuery = event.query
        if (event.status === 'in_progress' && searchQuery) {
          webSearchState = { query: searchQuery, status: 'searching' }
          assistantMessage = {
            ...assistantMessage,
            webSearch: webSearchState,
            webSearchBeforeThinking: !thinkingStarted,
          }
          commit(assistantMessage)
          markFirstActivity()
        } else if (event.status === 'completed' && webSearchState) {
          webSearchState = {
            query: webSearchState.query,
            status: 'completed',
            sources: webSearchState.sources,
          }
          assistantMessage = { ...assistantMessage, webSearch: webSearchState }
          scheduleStreamingUpdate()
        } else if (event.status === 'failed' && webSearchState) {
          webSearchState = {
            query: webSearchState.query,
            status: 'failed',
            sources: [],
          }
          assistantMessage = { ...assistantMessage, webSearch: webSearchState }
          scheduleStreamingUpdate()
        } else if (event.status === 'blocked') {
          webSearchState = {
            query: searchQuery,
            status: 'blocked',
            reason: event.reason,
          }
          assistantMessage = {
            ...assistantMessage,
            webSearch: webSearchState,
            webSearchBeforeThinking: !thinkingStarted,
          }
          scheduleStreamingUpdate()
        }
        return
      }

      if (event.type === 'url_fetch') {
        if (event.status === 'fetching') {
          urlFetches = [
            ...urlFetches,
            { id: event.id, url: event.url, status: 'fetching' },
          ]
        } else {
          urlFetches = urlFetches.map((f) =>
            f.id === event.id ? { ...f, status: event.status } : f,
          )
        }
        assistantMessage = {
          ...assistantMessage,
          urlFetches: [...urlFetches],
        }
        scheduleStreamingUpdate()
        return
      }

      if (event.type === 'url_citation') {
        collectedSources.push({ title: event.title, url: event.url })
        collectedAnnotations.push({
          type: 'url_citation',
          url_citation: { title: event.title, url: event.url },
        })
        if (webSearchState) {
          webSearchState = {
            query: webSearchState.query,
            status: webSearchState.status,
            sources: [...collectedSources],
          }
          assistantMessage = {
            ...assistantMessage,
            webSearch: webSearchState,
            annotations: [...collectedAnnotations],
          }
        } else {
          assistantMessage = {
            ...assistantMessage,
            annotations: [...collectedAnnotations],
          }
        }
        scheduleStreamingUpdate()
        return
      }

      if (event.type === 'search_reasoning_delta') {
        searchReasoning += event.delta
        assistantMessage = {
          ...assistantMessage,
          searchReasoning,
        }
        scheduleStreamingUpdate()
        return
      }
    } catch (err) {
      logError('sidechannel listener failed', err, {
        component: 'streaming-processor',
        action: 'sidechannel',
      })
    }
  })

  try {
    ctx.isStreamingRef.current = true
    if (streamingChatId) streamingTracker.startStreaming(streamingChatId)

    for await (const part of handle.result.fullStream) {
      if (!isSameChat()) {
        break
      }

      switch (part.type) {
        case 'start':
        case 'start-step':
          break

        case 'text-delta': {
          markFirstActivity()
          // When reasoning was active (thoughts buffered) and the first text
          // arrives, finalize thinking.
          if (
            assistantMessage.isThinking ||
            ctx.thinkingStartTimeRef.current !== null
          ) {
            const thinkingDuration = getThinkingDuration(
              ctx.thinkingStartTimeRef,
            )
            ctx.setIsThinking(false)
            assistantMessage = {
              ...assistantMessage,
              isThinking: false,
              thinkingDuration,
            }
          }
          assistantMessage = {
            ...assistantMessage,
            content: (assistantMessage.content || '') + part.text,
          }
          scheduleStreamingUpdate()
          break
        }

        case 'reasoning-start': {
          markFirstActivity()
          if (!thinkingStarted) {
            thinkingStarted = true
            ctx.thinkingStartTimeRef.current = Date.now()
            ctx.setIsThinking(true)
          }
          assistantMessage = {
            ...assistantMessage,
            isThinking: true,
            thoughts: assistantMessage.thoughts || '',
          }
          commit(assistantMessage)
          break
        }

        case 'reasoning-delta': {
          markFirstActivity()
          if (!thinkingStarted) {
            thinkingStarted = true
            ctx.thinkingStartTimeRef.current = Date.now()
            ctx.setIsThinking(true)
          }
          assistantMessage = {
            ...assistantMessage,
            thoughts: (assistantMessage.thoughts || '') + part.text,
            isThinking: true,
          }
          scheduleStreamingUpdate()
          break
        }

        case 'reasoning-end':
          // End of reasoning is handled lazily on first text-delta so the
          // thinking duration reflects time-to-first-token.
          break

        case 'tool-input-start': {
          markFirstActivity()
          toolCallsInProgress.set(part.id, {
            id: part.id,
            name: part.toolName,
            arguments: '',
          })
          assistantMessage = {
            ...assistantMessage,
            toolCalls: Array.from(toolCallsInProgress.values()),
          }
          scheduleStreamingUpdate()
          break
        }

        case 'tool-input-delta': {
          const existing = toolCallsInProgress.get(part.id)
          if (existing) {
            existing.arguments += part.delta
            assistantMessage = {
              ...assistantMessage,
              toolCalls: Array.from(toolCallsInProgress.values()),
            }
            scheduleStreamingUpdate()
          }
          break
        }

        case 'tool-input-end':
          // Nothing to do — the finalized tool-call arrives next.
          break

        case 'tool-call': {
          // The AI SDK delivers the final tool input as a typed object. Keep
          // `arguments` as the canonical string (for persistence) but also
          // store the pre-parsed value on `input` so the renderer doesn't
          // re-parse on every frame.
          const parsedInput: unknown =
            typeof part.input === 'string' ? undefined : part.input
          const finalArgs =
            typeof part.input === 'string'
              ? part.input
              : JSON.stringify(part.input)
          const existing = toolCallsInProgress.get(part.toolCallId)
          if (existing) {
            existing.name = part.toolName
            existing.arguments = finalArgs
            existing.input = parsedInput
          } else {
            toolCallsInProgress.set(part.toolCallId, {
              id: part.toolCallId,
              name: part.toolName,
              arguments: finalArgs,
              input: parsedInput,
            })
          }
          assistantMessage = {
            ...assistantMessage,
            toolCalls: Array.from(toolCallsInProgress.values()),
          }
          scheduleStreamingUpdate()
          break
        }

        case 'error': {
          logError('AI SDK stream error', part.error, {
            component: 'streaming-processor',
            action: 'fullStream.error',
          })
          throw part.error
        }

        case 'abort': {
          // Abort is raised when the signal fires — drain gracefully.
          break
        }

        default:
          // Ignore unhandled part types (file, source, finish, etc.)
          break
      }
    }

    // Flush any pending rAF update and commit the final state.
    cancelScheduled()

    if (assistantMessage.isThinking) {
      const thinkingDuration = getThinkingDuration(ctx.thinkingStartTimeRef)
      ctx.setIsThinking(false)
      assistantMessage = {
        ...assistantMessage,
        isThinking: false,
        thinkingDuration,
      }
    }

    if (assistantMessage.content && collectedSources.length > 0) {
      assistantMessage = {
        ...assistantMessage,
        content: processCitationMarkers(
          assistantMessage.content,
          collectedSources,
        ),
      }
    }

    if (isSameChat()) {
      commit(assistantMessage)
    }
  } finally {
    unsubscribe()
    cancelScheduled()
    ctx.setLoadingState('idle')
    ctx.isStreamingRef.current = false
    ctx.setIsStreaming(false)
    if (streamingChatId) streamingTracker.endStreaming(streamingChatId)
    if (
      ctx.currentChatIdRef.current &&
      ctx.currentChatIdRef.current !== streamingChatId
    ) {
      streamingTracker.endStreaming(ctx.currentChatIdRef.current)
    }
    ctx.setIsThinking(false)
    ctx.thinkingStartTimeRef.current = null
    ctx.setIsWaitingForResponse(false)
  }

  return assistantMessage
}
