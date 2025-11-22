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
import type { Chat, Message } from '../types'

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

  // Track whether the server ID has been assigned during this stream
  let serverIdAssigned = false
  let expectedServerId: string | null = null

  // Helper to check if we're still in the same chat (accounting for temp ID swaps)
  const isSameChat = () => {
    const currentId = ctx.currentChatIdRef.current

    // If current ID matches starting ID exactly, we're in the same chat
    if (currentId === startingChatId) {
      return true
    }

    // Handle temp ID transitions to server ID:
    // When a temp chat gets a server ID, currentId changes from temp-xxx to the server ID
    // We need to detect this transition and track the new server ID
    if (startingChatId.startsWith('temp-')) {
      // First time seeing a non-temp ID, record it as the expected server ID
      if (!serverIdAssigned && !currentId.startsWith('temp-') && currentId) {
        serverIdAssigned = true
        expectedServerId = currentId
      }

      // If we've recorded a server ID, only accept that specific ID
      if (serverIdAssigned && expectedServerId) {
        return currentId === expectedServerId
      }

      // If current ID is a different temp chat or empty, user navigated away
      if (currentId.startsWith('temp-') || !currentId) {
        return false
      }

      // Haven't assigned server ID yet, but current is a server ID - this might be the transition
      // However, we can't be sure, so we need to be conservative
      // Only accept if it's the first non-temp ID we're seeing
      return !serverIdAssigned
    }

    // For non-temp starting IDs, we've already checked exact match above
    return false
  }

  try {
    ctx.isStreamingRef.current = true
    if (streamingChatId) streamingTracker.startStreaming(streamingChatId)

    let thoughtsBuffer = ''
    let isInThinkingMode = false
    let isFirstChunk = true
    let initialContentBuffer = ''
    let sseBuffer = ''
    let isUsingReasoningFormat = false

    const scheduleStreamingUpdate = () => {
      if (rafId !== null) return
      rafId =
        typeof window !== 'undefined' &&
        typeof window.requestAnimationFrame === 'function'
          ? window.requestAnimationFrame(() => {
              rafId = null
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
                  true, // Skip IndexedDB save during streaming
                )
              }
            })
          : setTimeout(() => {
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
            role: 'assistant',
            content: initialContentBuffer.trim(),
            timestamp: assistantMessage?.timestamp || new Date(),
            isThinking: false,
          }
          if (ctx.currentChatIdRef.current === ctx.updatedChat.id) {
            const newMessages = [...ctx.updatedMessages, assistantMessage]
            ctx.updateChatWithHistoryCheck(
              ctx.setChats,
              ctx.updatedChat,
              ctx.setCurrentChat,
              ctx.updatedChat.id,
              newMessages,
              false,
              false, // Save to IndexedDB when stream completes
            )
          }
        } else if (isInThinkingMode && thoughtsBuffer.trim()) {
          isInThinkingMode = false
          ctx.setIsThinking(false)
          const thinkingDuration = getThinkingDuration(ctx.thinkingStartTimeRef)

          assistantMessage = isUsingReasoningFormat
            ? {
                role: 'assistant',
                content: '',
                thoughts: thoughtsBuffer.trim(),
                timestamp: assistantMessage?.timestamp || new Date(),
                isThinking: false,
                thinkingDuration,
              }
            : {
                role: 'assistant',
                content: thoughtsBuffer.trim(),
                timestamp: assistantMessage?.timestamp || new Date(),
                isThinking: false,
                thinkingDuration,
              }
          if (ctx.currentChatIdRef.current === ctx.updatedChat.id) {
            const chatId = ctx.currentChatIdRef.current
            const newMessages = [...ctx.updatedMessages, assistantMessage]
            ctx.updateChatWithHistoryCheck(
              ctx.setChats,
              ctx.updatedChat,
              ctx.setCurrentChat,
              chatId,
              newMessages,
              false,
              false, // Save to IndexedDB when stream completes
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

          const hasReasoningContent =
            'reasoning_content' in (json.choices?.[0]?.delta || {}) ||
            'reasoning_content' in (json.choices?.[0]?.message || {})
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
            ctx.setIsThinking(true)
            ctx.thinkingStartTimeRef.current = Date.now()
            assistantMessage = {
              ...assistantMessage,
              thoughts: reasoningContent || '',
              isThinking: true,
            }
            if (ctx.currentChatIdRef.current === ctx.updatedChat.id) {
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
              if (ctx.currentChatIdRef.current === ctx.updatedChat.id) {
                scheduleStreamingUpdate()
              }
              continue
            } else if (reasoningContent) {
              assistantMessage = {
                ...assistantMessage,
                thoughts: thoughtsBuffer,
                isThinking: isInThinkingMode,
              }
              if (ctx.currentChatIdRef.current === ctx.updatedChat.id) {
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

                    if (ctx.currentChatIdRef.current === ctx.updatedChat.id) {
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

                    if (ctx.currentChatIdRef.current === ctx.updatedChat.id) {
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
  } finally {
    ctx.setLoadingState('idle')
    ctx.isStreamingRef.current = false
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
