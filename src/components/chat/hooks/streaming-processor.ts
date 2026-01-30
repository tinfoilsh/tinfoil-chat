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
import { CONSTANTS } from '../constants'
import type {
  Annotation,
  Chat,
  Message,
  WebSearchSource,
  WebSearchState,
} from '../types'

/**
 * Process citation markers (e.g. 【1】) into markdown links.
 * Called once at stream end to store processed content.
 */
function processCitationMarkers(
  content: string,
  sources: WebSearchSource[],
): string {
  if (sources.length === 0) return content

  return content.replace(/【(\d+)[^】]*】/g, (match, num) => {
    const index = parseInt(num, 10) - 1
    const source = sources[index]
    if (!source) return match
    const encodedUrl = source.url
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\|/g, '%7C')
    return `[cite](#cite-${num}~${encodedUrl})`
  })
}

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
  onEarlyTitleGeneration?: (content: string) => void // Callback for early title generation
  titleGeneratedRef?: React.MutableRefObject<boolean> // Track if title was already generated
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
    let earlyTitleTriggered = false
    let webSearchState: WebSearchState | undefined = undefined
    let collectedSources: WebSearchSource[] = []
    let collectedAnnotations: Annotation[] = []
    let searchReasoning = ''
    let webSearchStarted = false
    let thinkingStarted = false

    // Helper to check word count and trigger early title generation
    const checkForEarlyTitleGeneration = (content: string) => {
      if (
        earlyTitleTriggered ||
        !ctx.isFirstMessage ||
        !ctx.onEarlyTitleGeneration ||
        ctx.updatedChat.title !== 'Untitled'
      ) {
        return
      }

      const wordCount = content.split(/\s+/).filter(Boolean).length
      if (wordCount >= CONSTANTS.TITLE_GENERATION_WORD_THRESHOLD) {
        earlyTitleTriggered = true
        ctx.onEarlyTitleGeneration(content)
      }
    }

    // Process citations for display during streaming
    const getMessageWithCitations = (): Message => {
      const msg = assistantMessage as Message
      if (msg.content && collectedSources.length > 0) {
        return {
          ...msg,
          content: processCitationMarkers(msg.content, collectedSources),
        }
      }
      return msg
    }

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
          assistantMessage = {
            ...assistantMessage,
            role: 'assistant',
            content: initialContentBuffer.trim(),
            timestamp: assistantMessage?.timestamp || new Date(),
            isThinking: false,
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

          // Handle web_search_call events
          if (json.type === 'web_search_call') {
            const searchQuery = json.action?.query
            const searchStatus = json.status

            if (searchStatus === 'in_progress' && searchQuery) {
              if (!webSearchStarted) {
                webSearchStarted = true
              }
              webSearchState = {
                query: searchQuery,
                status: 'searching',
              }
              assistantMessage = {
                ...assistantMessage,
                webSearch: webSearchState,
                webSearchBeforeThinking: !thinkingStarted,
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
            } else if (searchStatus === 'completed' && webSearchState) {
              webSearchState = {
                query: webSearchState.query,
                status: 'completed',
                sources: webSearchState.sources,
              }
              assistantMessage = {
                ...assistantMessage,
                webSearch: webSearchState,
              }
              if (isSameChat()) {
                scheduleStreamingUpdate()
              }
            } else if (searchStatus === 'failed' && webSearchState) {
              webSearchState = {
                query: webSearchState.query,
                status: 'failed',
                sources: [],
              }
              assistantMessage = {
                ...assistantMessage,
                webSearch: webSearchState,
              }
              if (isSameChat()) {
                scheduleStreamingUpdate()
              }
            } else if (searchStatus === 'blocked') {
              if (!webSearchStarted) {
                webSearchStarted = true
              }
              webSearchState = {
                query: searchQuery,
                status: 'blocked',
                reason: json.reason,
              }
              assistantMessage = {
                ...assistantMessage,
                webSearch: webSearchState,
                webSearchBeforeThinking: !thinkingStarted,
              }
              if (isSameChat()) {
                scheduleStreamingUpdate()
              }
            }
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
                  // Add to collectedSources without deduplication to preserve citation index mapping
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
                assistantMessage = {
                  ...assistantMessage,
                  webSearch: webSearchState,
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
            json.choices?.[0]?.delta?.reasoning_content
          const messageReasoningContent =
            json.choices?.[0]?.message?.reasoning_content
          const hasReasoningContent =
            (deltaReasoningContent !== undefined &&
              deltaReasoningContent !== null) ||
            (messageReasoningContent !== undefined &&
              messageReasoningContent !== null)
          const reasoningContent =
            json.choices?.[0]?.message?.reasoning_content ||
            json.choices?.[0]?.delta?.reasoning_content ||
            ''
          let content = json.choices?.[0]?.delta?.content || ''

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
              assistantMessage = {
                ...assistantMessage,
                thoughts: thoughtsBuffer.trim() || undefined,
                content: content,
                isThinking: false,
                thinkingDuration,
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
            assistantMessage = {
              ...assistantMessage,
              content: (assistantMessage.content || '') + content,
              isThinking: false,
            }
            checkForEarlyTitleGeneration(assistantMessage.content || '')
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
                      assistantMessage = {
                        ...assistantMessage,
                        content: (assistantMessage.content || '') + remaining,
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
              assistantMessage.content =
                (assistantMessage.content || '') + remainingContent
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
              assistantMessage = {
                ...assistantMessage,
                content: (assistantMessage.content || '') + content,
                isThinking: false,
              }
              checkForEarlyTitleGeneration(assistantMessage.content || '')
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

    // Process citation markers into links before returning
    if (assistantMessage?.content && collectedSources.length > 0) {
      assistantMessage = {
        ...assistantMessage,
        content: processCitationMarkers(
          assistantMessage.content,
          collectedSources,
        ),
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
