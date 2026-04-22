/**
 * Streaming processor
 *
 * Consumes SSE-style responses from OpenAI-compatible APIs and drives a single
 * assistant turn. Supports two thinking formats:
 * - <think>...</think> tags
 * - reasoning_content deltas
 *
 * Batches UI writes via rAF/setTimeout to avoid layout thrash and never writes
 * to storage directly. All persistence goes through updateChatWithHistoryCheck.
 */
import { streamingTracker } from '@/services/cloud/streaming-tracker'
import { logError } from '@/utils/error-handling'
import {
  createTinfoilEventParser,
  type TinfoilWebSearchCallEvent,
} from '@/utils/tinfoil-events'
import type {
  Annotation,
  Chat,
  Message,
  MessageSegment,
  URLFetchState,
  WebSearchInstance,
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
  startingChatId: string // Capture the chat ID at the start of the query
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

// Drives one assistant response from a streaming endpoint.
// Returns the final assistant message (content and/or thoughts) or null.
export async function processStreamingResponse(
  response: Response,
  ctx: StreamingContext,
): Promise<Message | null> {
  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  let assistantMessage: Message | null = {
    role: 'assistant',
    content: '',
    timestamp: new Date(),
  }

  const streamingChatId = ctx.updatedChat.id
  let rafId: number | ReturnType<typeof setTimeout> | null = null

  // Use the starting chat ID passed from context (captured before async operations)
  const startingChatId = ctx.startingChatId

  const isSameChat = () => ctx.currentChatIdRef.current === startingChatId

  try {
    ctx.isStreamingRef.current = true
    if (streamingChatId) streamingTracker.startStreaming(streamingChatId)

    let thoughtsBuffer = ''
    let isInThinkingMode = false
    let isFirstChunk = true
    let initialContentBuffer = ''
    let sseBuffer = ''
    let isUsingReasoningFormat = false
    let webSearchState: WebSearchState | undefined = undefined
    let urlFetches: URLFetchState[] = []
    let collectedSources: WebSearchSource[] = []
    let collectedAnnotations: Annotation[] = []
    let searchReasoning = ''
    let webSearchStarted = false
    let thinkingStarted = false

    // Ordered content segments (text + inline event refs) that preserve the
    // exact order in which the router surfaced events relative to the
    // streamed text. The aggregate `webSearch`/`urlFetches` fields are kept
    // in sync for legacy consumers (SourcesButton, title generation).
    let segments: MessageSegment[] = []
    let webSearches: WebSearchInstance[] = []
    let nextSearchId = 0

    const allocateSearchId = () => `ws-${nextSearchId++}`

    const appendText = (text: string) => {
      if (!text) return
      const last = segments[segments.length - 1]
      if (last && last.type === 'text') {
        segments = [
          ...segments.slice(0, -1),
          { type: 'text', text: last.text + text },
        ]
      } else {
        segments = [...segments, { type: 'text', text }]
      }
    }

    const upsertWebSearchInstance = (instance: WebSearchInstance) => {
      const idx = webSearches.findIndex((w) => w.id === instance.id)
      if (idx >= 0) {
        webSearches = [
          ...webSearches.slice(0, idx),
          instance,
          ...webSearches.slice(idx + 1),
        ]
      } else {
        webSearches = [...webSearches, instance]
        segments = [...segments, { type: 'web_search', searchId: instance.id }]
      }
    }

    const setContentAndRebuildTrailingText = (newContent: string) => {
      // Strip any trailing text segment(s) and rebuild from the full content
      // string. This keeps segments consistent when code paths replace the
      // full `content` instead of appending deltas (e.g. initial chunk
      // buffer flush, <think>/</think> splits).
      let lastEventIdx = -1
      for (let i = segments.length - 1; i >= 0; i--) {
        if (segments[i].type !== 'text') {
          lastEventIdx = i
          break
        }
      }
      const prefix = segments.slice(0, lastEventIdx + 1)
      const eventContentLength = prefix.reduce((acc, seg) => {
        if (seg.type === 'text') return acc + seg.text.length
        return acc
      }, 0)
      const trailingText = newContent.slice(eventContentLength)
      segments = trailingText
        ? [...prefix, { type: 'text', text: trailingText }]
        : prefix
    }

    // The router delivers citations as standard markdown links inside the
    // assistant content, so the UI can forward the message through the
    // markdown renderer unchanged.
    const getMessageWithCitations = (): Message => assistantMessage as Message

    const scheduleStreamingUpdate = () => {
      if (rafId !== null) return
      rafId =
        typeof window !== 'undefined' &&
        typeof window.requestAnimationFrame === 'function'
          ? window.requestAnimationFrame(() => {
              rafId = null
              if (isSameChat()) {
                const chatId = ctx.currentChatIdRef.current
                const messageToSave = getMessageWithCitations()
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
            })
          : setTimeout(() => {
              if (isSameChat()) {
                const chatId = ctx.currentChatIdRef.current
                const messageToSave = getMessageWithCitations()
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
              rafId = null
            }, 16)
    }

    // Parser for `<tinfoil-event>...</tinfoil-event>` progress markers
    // the router inlines into delta.content when the client opts in via
    // the X-Tinfoil-Events header. Markers are stripped from the
    // visible text before it reaches the assistant message; decoded
    // events drive the same webSearchState / urlFetches state machine
    // the legacy top-level SSE path used.
    const tinfoilEventParser = createTinfoilEventParser()

    const normalizeEventSources = (
      sources:
        | Array<{
            title?: string
            url?: string
          }>
        | undefined,
    ): WebSearchSource[] | undefined => {
      if (!sources || sources.length === 0) return undefined
      const normalized = sources.flatMap((source) => {
        if (!source?.url) return []
        return [
          {
            title: source.title || source.url,
            url: source.url,
          },
        ]
      })
      return normalized.length > 0 ? normalized : undefined
    }

    /**
     * Dispatches a normalized web_search_call event into the live
     * streaming state. Callers normalize to a common shape so the
     * legacy top-level SSE branch and the new marker-extracted events
     * share one code path.
     */
    const applyWebSearchCallEvent = (event: {
      id?: string
      status: string
      action?: { type?: string; query?: string; url?: string }
      sources?: WebSearchSource[]
      reason?: string
    }) => {
      // `assistantMessage` is typed `Message | null` at the outer scope
      // but is never reassigned to `null` once streaming begins. The
      // helper runs exclusively inside the streaming loop, so force
      // the narrowing here instead of threading the field through
      // another parameter.
      const current = assistantMessage as Message
      // URL fetch events surface as action.type === 'open_page'.
      if (event.action?.type === 'open_page' && event.action?.url) {
        const fetchUrl = event.action.url
        const fetchId = event.id || fetchUrl
        const fetchStatus = event.status

        if (fetchStatus === 'in_progress') {
          if (!urlFetches.some((f) => f.id === fetchId)) {
            urlFetches = [
              ...urlFetches,
              { id: fetchId, url: fetchUrl, status: 'fetching' },
            ]
            segments = [...segments, { type: 'url_fetch', fetchId }]
          }
        } else if (
          fetchStatus === 'completed' ||
          fetchStatus === 'failed' ||
          fetchStatus === 'blocked'
        ) {
          // URLFetchState has no distinct `blocked` status slot, so a
          // safety-block on a URL fetch is collapsed onto `failed` in
          // the UI. The router's richer `blocked` signal still surfaces
          // on the separate webSearchState when the whole search is
          // blocked; per-URL blocks are rare and the fallback keeps
          // the UI consistent with the spec-defined URLFetchStatus
          // enum.
          const next: URLFetchState['status'] =
            fetchStatus === 'blocked' ? 'failed' : fetchStatus
          urlFetches = urlFetches.map((f) =>
            f.id === fetchId ? { ...f, status: next } : f,
          )
        }

        assistantMessage = {
          ...current,
          urlFetches: [...urlFetches],
          segments: [...segments],
        }
        if (isSameChat()) {
          scheduleStreamingUpdate()
        }
        return
      }

      const searchQuery = event.action?.query
      const searchStatus = event.status

      // Resolve which in-flight WebSearchInstance this event refers to.
      // The router may or may not provide a stable id; when it doesn't,
      // status updates address the most recent instance.
      const findInstance = (): WebSearchInstance | undefined => {
        if (event.id) {
          const hit = webSearches.find((w) => w.id === event.id)
          if (hit) return hit
        }
        return webSearches[webSearches.length - 1]
      }

      if (searchStatus === 'in_progress' && searchQuery) {
        if (!webSearchStarted) {
          webSearchStarted = true
        }
        const id = event.id || allocateSearchId()
        const instance: WebSearchInstance = {
          id,
          query: searchQuery,
          status: 'searching',
        }
        upsertWebSearchInstance(instance)
        webSearchState = {
          query: instance.query,
          status: instance.status,
        }
        assistantMessage = {
          ...current,
          webSearch: webSearchState,
          webSearchBeforeThinking: !thinkingStarted,
          segments: [...segments],
          webSearches: [...webSearches],
        }
        if (isSameChat()) {
          const chatId = ctx.currentChatIdRef.current
          const messageToSave = assistantMessage as Message
          const newMessages = [...ctx.updatedMessages, messageToSave]
          ctx.updateChatWithHistoryCheck(
            ctx.setChats,
            { ...ctx.updatedChat, id: chatId },
            ctx.setCurrentChat,
            chatId,
            newMessages,
            false,
            true,
          )
          ctx.setIsWaitingForResponse(false)
        }
      } else if (searchStatus === 'completed') {
        const existing = findInstance()
        if (existing) {
          const updated: WebSearchInstance = {
            ...existing,
            status: 'completed',
            sources: event.sources ?? existing.sources,
          }
          upsertWebSearchInstance(updated)
          webSearchState = {
            query: updated.query,
            status: 'completed',
            sources: updated.sources,
          }
          assistantMessage = {
            ...current,
            webSearch: webSearchState,
            segments: [...segments],
            webSearches: [...webSearches],
          }
          if (isSameChat()) {
            scheduleStreamingUpdate()
          }
        }
      } else if (searchStatus === 'failed') {
        const existing = findInstance()
        if (existing) {
          const updated: WebSearchInstance = {
            ...existing,
            status: 'failed',
            sources: event.sources ?? [],
          }
          upsertWebSearchInstance(updated)
          webSearchState = {
            query: updated.query,
            status: 'failed',
            sources: updated.sources,
          }
          assistantMessage = {
            ...current,
            webSearch: webSearchState,
            segments: [...segments],
            webSearches: [...webSearches],
          }
          if (isSameChat()) {
            scheduleStreamingUpdate()
          }
        }
      } else if (searchStatus === 'blocked') {
        if (!webSearchStarted) {
          webSearchStarted = true
        }
        const existing = findInstance()
        const id = existing?.id || event.id || allocateSearchId()
        const updated: WebSearchInstance = {
          id,
          query: searchQuery ?? existing?.query,
          status: 'blocked',
          reason: event.reason,
        }
        upsertWebSearchInstance(updated)
        webSearchState = {
          query: updated.query,
          status: 'blocked',
          reason: event.reason,
        }
        assistantMessage = {
          ...current,
          webSearch: webSearchState,
          webSearchBeforeThinking: !thinkingStarted,
          segments: [...segments],
          webSearches: [...webSearches],
        }
        if (isSameChat()) {
          scheduleStreamingUpdate()
        }
      }
    }

    /**
     * Adapts a marker-shaped payload to the normalized dispatch shape.
     * Marker payloads carry `item_id` and `error.code`; the legacy
     * top-level SSE events carry `id` and `reason`. Everything else is
     * structurally identical so we just re-key the two fields.
     */
    const dispatchMarkerEvent = (event: TinfoilWebSearchCallEvent) => {
      applyWebSearchCallEvent({
        id: event.item_id,
        status: event.status,
        action: event.action,
        sources: normalizeEventSources(event.sources),
        reason: event.error?.code,
      })
    }

    while (true) {
      const { done, value } = await reader!.read()
      if (done || !isSameChat()) {
        if (rafId !== null) {
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

        if (isFirstChunk && initialContentBuffer.trim()) {
          const finalContent = initialContentBuffer.trim()
          setContentAndRebuildTrailingText(finalContent)
          assistantMessage = {
            ...assistantMessage,
            role: 'assistant',
            content: finalContent,
            timestamp: assistantMessage?.timestamp || new Date(),
            isThinking: false,
            segments: [...segments],
          }
          if (isSameChat()) {
            const newMessages = [...ctx.updatedMessages, assistantMessage]
            ctx.updateChatWithHistoryCheck(
              ctx.setChats,
              ctx.updatedChat,
              ctx.setCurrentChat,
              ctx.currentChatIdRef.current,
              newMessages,
              false,
              true, // Skip IndexedDB save - final save happens after title generation
            )
          }
        } else if (isInThinkingMode && thoughtsBuffer.trim()) {
          isInThinkingMode = false
          ctx.setIsThinking(false)
          const thinkingDuration = getThinkingDuration(ctx.thinkingStartTimeRef)

          assistantMessage = isUsingReasoningFormat
            ? {
                ...assistantMessage,
                role: 'assistant',
                content: '',
                thoughts: thoughtsBuffer.trim(),
                timestamp: assistantMessage?.timestamp || new Date(),
                isThinking: false,
                thinkingDuration,
              }
            : {
                ...assistantMessage,
                role: 'assistant',
                content: thoughtsBuffer.trim(),
                timestamp: assistantMessage?.timestamp || new Date(),
                isThinking: false,
                thinkingDuration,
              }
          if (isSameChat()) {
            const chatId = ctx.currentChatIdRef.current
            const newMessages = [...ctx.updatedMessages, assistantMessage]
            ctx.updateChatWithHistoryCheck(
              ctx.setChats,
              ctx.updatedChat,
              ctx.setCurrentChat,
              chatId,
              newMessages,
              false,
              true, // Skip IndexedDB save - final save happens after title generation
            )
          }
        }
        break
      }

      const chunk = decoder.decode(value, { stream: true })
      sseBuffer += chunk
      // Split on both Unix and Windows newlines
      const lines = sseBuffer.split(/\r?\n/)
      sseBuffer = lines.pop() || ''

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) continue
        // Trim before comparing to handle trailing CRs/whitespace
        if (line === 'data: [DONE]' || !line.startsWith('data:')) continue
        try {
          // Allow arbitrary spaces after the colon: `data:    {...}`
          const jsonData = line.replace(/^data:\s*/i, '')
          const json = JSON.parse(jsonData)

          // Legacy top-level `web_search_call` SSE records. Current
          // routers surface the same progression through inline
          // `<tinfoil-event>` markers on delta.content; this branch
          // stays so older router builds that still emit the legacy
          // record shape keep the same UX.
          if (json.type === 'web_search_call') {
            applyWebSearchCallEvent({
              id: typeof json.id === 'string' ? json.id : undefined,
              status: String(json.status ?? ''),
              action: json.action,
              sources: normalizeEventSources(
                Array.isArray(json.sources)
                  ? (json.sources as Array<{ title?: string; url?: string }>)
                  : undefined,
              ),
              reason: typeof json.reason === 'string' ? json.reason : undefined,
            })
            continue
          }

          // Handle search_reasoning field
          const deltaSearchReasoning =
            json.choices?.[0]?.delta?.search_reasoning
          if (deltaSearchReasoning) {
            searchReasoning += deltaSearchReasoning
            assistantMessage = {
              ...assistantMessage,
              searchReasoning,
            }
          }

          // Handle url_citation annotations
          const annotations = json.choices?.[0]?.delta?.annotations
          if (annotations && Array.isArray(annotations)) {
            for (const annotation of annotations) {
              if (
                annotation.type === 'url_citation' &&
                annotation.url_citation
              ) {
                const { title, url } = annotation.url_citation
                if (url) {
                  // Track the sources the router annotated so the web-search
                  // panel can list them alongside the inline markdown links.
                  collectedSources.push({
                    title: title || url,
                    url,
                  })
                  collectedAnnotations.push({
                    type: 'url_citation',
                    url_citation: {
                      title: title || url,
                      url,
                    },
                  })
                }
              }
            }
            if (collectedSources.length > 0) {
              // Update webSearchState with sources if it exists
              if (webSearchState) {
                webSearchState = {
                  query: webSearchState.query,
                  status: webSearchState.status,
                  sources: [...collectedSources],
                }
                // Legacy annotation streams don't identify which web-search
                // instance a source belongs to. Only mirror them onto an
                // inline search pill when there's exactly one search, so
                // multi-search turns don't incorrectly attach every favicon
                // cluster to the last search row.
                const lastInstance = webSearches[webSearches.length - 1]
                if (lastInstance && webSearches.length === 1) {
                  upsertWebSearchInstance({
                    ...lastInstance,
                    sources: [...collectedSources],
                  })
                }
                assistantMessage = {
                  ...assistantMessage,
                  webSearch: webSearchState,
                  webSearches: [...webSearches],
                  annotations: [...collectedAnnotations],
                }
              } else {
                // Store annotations even without webSearchState
                assistantMessage = {
                  ...assistantMessage,
                  annotations: [...collectedAnnotations],
                }
              }
            }
          }

          const deltaReasoningContent =
            json.choices?.[0]?.delta?.reasoning_content ??
            json.choices?.[0]?.delta?.reasoning
          const messageReasoningContent =
            json.choices?.[0]?.message?.reasoning_content ??
            json.choices?.[0]?.message?.reasoning
          const hasReasoningContent =
            (deltaReasoningContent !== undefined &&
              deltaReasoningContent !== null) ||
            (messageReasoningContent !== undefined &&
              messageReasoningContent !== null)
          const reasoningContent =
            json.choices?.[0]?.message?.reasoning_content ||
            json.choices?.[0]?.message?.reasoning ||
            json.choices?.[0]?.delta?.reasoning_content ||
            json.choices?.[0]?.delta?.reasoning ||
            ''
          let content = json.choices?.[0]?.delta?.content || ''

          // Strip any `<tinfoil-event>` progress markers the router
          // embeds in delta.content when the caller opts into the
          // event stream. Dispatched events drive the same
          // webSearchState / urlFetches machinery as the legacy SSE
          // records; the cleaned text flows through the rest of the
          // pipeline so the assistant message never contains raw
          // marker tags.
          if (content) {
            const { text: cleaned, events } =
              tinfoilEventParser.consume(content)
            for (const event of events) {
              dispatchMarkerEvent(event)
            }
            content = cleaned
          }

          if (
            hasReasoningContent &&
            !isUsingReasoningFormat &&
            !isInThinkingMode
          ) {
            isUsingReasoningFormat = true
            isInThinkingMode = true
            thinkingStarted = true
            ctx.setIsThinking(true)
            ctx.thinkingStartTimeRef.current = Date.now()
            assistantMessage = {
              ...assistantMessage,
              thoughts: reasoningContent || '',
              isThinking: true,
            }
            if (isSameChat()) {
              const chatId = ctx.currentChatIdRef.current
              const messageToSave = assistantMessage as Message
              const newMessages = [...ctx.updatedMessages, messageToSave]
              ctx.updateChatWithHistoryCheck(
                ctx.setChats,
                ctx.updatedChat,
                ctx.setCurrentChat,
                chatId,
                newMessages,
                false,
                true, // Skip IndexedDB save during streaming
              )
              if (
                typeof window !== 'undefined' &&
                typeof window.requestAnimationFrame === 'function'
              ) {
                window.requestAnimationFrame(() => {
                  ctx.setIsWaitingForResponse(false)
                })
              } else {
                setTimeout(() => {
                  ctx.setIsWaitingForResponse(false)
                }, 16)
              }
            }
            isFirstChunk = false
            if (reasoningContent) thoughtsBuffer = reasoningContent
            continue
          } else if (isUsingReasoningFormat && hasReasoningContent) {
            if (reasoningContent) thoughtsBuffer += reasoningContent
            if (content && isInThinkingMode) {
              isInThinkingMode = false
              ctx.setIsThinking(false)
              const thinkingDuration = getThinkingDuration(
                ctx.thinkingStartTimeRef,
              )
              appendText(content)
              assistantMessage = {
                ...assistantMessage,
                thoughts: thoughtsBuffer.trim() || undefined,
                content: content,
                isThinking: false,
                thinkingDuration,
                segments: [...segments],
              }
              if (isSameChat()) {
                scheduleStreamingUpdate()
              }
              continue
            } else if (reasoningContent) {
              assistantMessage = {
                ...assistantMessage,
                thoughts: thoughtsBuffer,
                isThinking: isInThinkingMode,
              }
              if (isSameChat()) {
                scheduleStreamingUpdate()
              }
              continue
            }
            // If we have content but no reasoningContent and not in thinking mode,
            // fall through to the content handling block below
          }

          if (isUsingReasoningFormat && content) {
            if (isInThinkingMode) {
              isInThinkingMode = false
              ctx.setIsThinking(false)
              const thinkingDuration = getThinkingDuration(
                ctx.thinkingStartTimeRef,
              )
              assistantMessage = { ...assistantMessage, thinkingDuration }
            }
            appendText(content)
            assistantMessage = {
              ...assistantMessage,
              content: (assistantMessage.content || '') + content,
              isThinking: false,
              segments: [...segments],
            }
            if (isSameChat()) {
              scheduleStreamingUpdate()
            }
            continue
          }

          if (!isUsingReasoningFormat) {
            if (isFirstChunk) {
              initialContentBuffer += content
              if (
                initialContentBuffer.includes('<think>') ||
                initialContentBuffer.length > 5
              ) {
                isFirstChunk = false
                content = initialContentBuffer
                initialContentBuffer = ''
                if (content.includes('<think>')) {
                  isInThinkingMode = true
                  thinkingStarted = true
                  ctx.setIsThinking(true)
                  ctx.thinkingStartTimeRef.current = Date.now()
                  content = content.replace(/^[\s\S]*?<think>/, '')
                  assistantMessage = {
                    ...assistantMessage,
                    isThinking: true,
                    thoughts: '',
                  }

                  // Handle same-chunk closing tag to avoid leaking visible text into thoughts
                  const closeIdx = content.indexOf('</think>')
                  if (closeIdx !== -1) {
                    const inner = content.slice(0, closeIdx)
                    const remaining = content.slice(closeIdx + 8) // 8 = length of '</think>'
                    if (inner) {
                      thoughtsBuffer += inner
                    }

                    // Finalize thinking immediately
                    isInThinkingMode = false
                    ctx.setIsThinking(false)
                    const thinkingDuration = getThinkingDuration(
                      ctx.thinkingStartTimeRef,
                    )
                    assistantMessage = {
                      ...assistantMessage,
                      thoughts: thoughtsBuffer.trim() || undefined,
                      isThinking: false,
                      thinkingDuration,
                    }
                    if (remaining.trim()) {
                      appendText(remaining)
                      assistantMessage = {
                        ...assistantMessage,
                        content: (assistantMessage.content || '') + remaining,
                        segments: [...segments],
                      }
                    }

                    if (isSameChat()) {
                      const chatId = ctx.currentChatIdRef.current
                      const messageToSave = assistantMessage as Message
                      const newMessages = [
                        ...ctx.updatedMessages,
                        messageToSave,
                      ]
                      ctx.updateChatWithHistoryCheck(
                        ctx.setChats,
                        ctx.updatedChat,
                        ctx.setCurrentChat,
                        chatId,
                        newMessages,
                        false,
                        true, // Skip IndexedDB save during streaming
                      )
                    }
                    content = ''
                  } else if (content) {
                    // Still inside thinking; buffer thoughts until '</think>' arrives
                    thoughtsBuffer += content
                    assistantMessage = {
                      ...assistantMessage,
                      thoughts: thoughtsBuffer,
                    }
                    content = ''

                    if (isSameChat()) {
                      const chatId = ctx.currentChatIdRef.current
                      const messageToSave = assistantMessage as Message
                      const newMessages = [
                        ...ctx.updatedMessages,
                        messageToSave,
                      ]
                      ctx.updateChatWithHistoryCheck(
                        ctx.setChats,
                        ctx.updatedChat,
                        ctx.setCurrentChat,
                        chatId,
                        newMessages,
                        false,
                        true, // Skip IndexedDB save during streaming
                      )
                    }
                  }
                }
                if (
                  typeof window !== 'undefined' &&
                  typeof window.requestAnimationFrame === 'function'
                ) {
                  window.requestAnimationFrame(() => {
                    ctx.setIsWaitingForResponse(false)
                  })
                } else {
                  setTimeout(() => {
                    ctx.setIsWaitingForResponse(false)
                  }, 16)
                }
              } else {
                continue
              }
            }
          }

          if (
            content.includes('</think>') &&
            isInThinkingMode &&
            !isUsingReasoningFormat
          ) {
            isInThinkingMode = false
            ctx.setIsThinking(false)
            const thinkingDuration = getThinkingDuration(
              ctx.thinkingStartTimeRef,
            )
            const parts = content.split('</think>')
            const finalThoughts = (thoughtsBuffer + (parts[0] || '')).trim()
            const remainingContent = parts.slice(1).join('')
            assistantMessage = {
              ...assistantMessage,
              thoughts: finalThoughts || undefined,
              isThinking: false,
              thinkingDuration,
            }
            if (remainingContent.trim()) {
              appendText(remainingContent)
              assistantMessage = {
                ...assistantMessage,
                content: (assistantMessage.content || '') + remainingContent,
                segments: [...segments],
              }
            }
            if (isSameChat()) {
              scheduleStreamingUpdate()
            }
            continue
          }

          if (isInThinkingMode && !isUsingReasoningFormat) {
            thoughtsBuffer += content
            assistantMessage = {
              ...assistantMessage,
              thoughts: thoughtsBuffer,
              isThinking: true,
            }
            if (isSameChat()) {
              scheduleStreamingUpdate()
            }
          } else if (!isInThinkingMode) {
            if (!isUsingReasoningFormat) {
              content = content.replace(/<think>|<\/think>/g, '')
            }
            if (content) {
              appendText(content)
              assistantMessage = {
                ...assistantMessage,
                content: (assistantMessage.content || '') + content,
                isThinking: false,
                segments: [...segments],
              }
              if (isSameChat()) {
                scheduleStreamingUpdate()
              }
            }
          }
        } catch (error) {
          logError('Failed to parse SSE line', error, {
            component: 'streaming-processor',
            metadata: { line },
          })
          continue
        }
      }
    }

    // Drain any bytes the tinfoil-event parser was holding back at
    // the byte boundary of the final delta. Anything left over is
    // either an unterminated marker body (router bug) or a trailing
    // fragment of what could have been an open tag. Surface it as
    // plain text so no assistant characters are lost, and strip any
    // residual marker tags defensively so the UI never renders raw
    // `<tinfoil-event>` bytes.
    const tail = tinfoilEventParser.flush()
    if (tail) {
      const safeTail = tail.replace(/<\/?tinfoil-event>/g, '')
      appendText(safeTail)
      assistantMessage = {
        ...assistantMessage,
        content: (assistantMessage.content || '') + safeTail,
        segments: [...segments],
      }
    }
  } finally {
    ctx.setLoadingState('idle')
    ctx.isStreamingRef.current = false
    ctx.setIsStreaming(false)
    // End streaming for both the original ID and current ID (in case ID changed)
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
    // Note: Save with title generation happens in use-chat-messaging.ts immediately after this
  }

  return assistantMessage
}
