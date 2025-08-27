import { type BaseModel } from '@/app/config/models'
import { useApiKey } from '@/hooks/use-api-key'
import { cloudSync } from '@/services/cloud/cloud-sync'
import { r2Storage } from '@/services/cloud/r2-storage'
import { streamingTracker } from '@/services/cloud/streaming-tracker'
import { chatStorage } from '@/services/storage/chat-storage'
import { sessionChatStorage } from '@/services/storage/session-storage'
import { logError, logWarning } from '@/utils/error-handling'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useRef, useState } from 'react'
import { scrollToBottom } from '../chat-messages'
import { ChatError, generateTitle } from '../chat-utils'
import { CONSTANTS } from '../constants'
import type { Chat, LoadingState, Message } from '../types'
import { useMaxMessages } from './use-max-messages'

interface UseChatMessagingProps {
  systemPrompt: string
  rules?: string
  storeHistory: boolean
  isPremium: boolean
  models: BaseModel[]
  selectedModel: string
  chats: Chat[]
  currentChat: Chat
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>
  setCurrentChat: React.Dispatch<React.SetStateAction<Chat>>
  messagesEndRef: React.RefObject<HTMLDivElement>
}

interface UseChatMessagingReturn {
  input: string
  loadingState: LoadingState
  inputRef: React.RefObject<HTMLTextAreaElement>
  isThinking: boolean
  isWaitingForResponse: boolean
  apiKey: string | null
  setInput: (input: string) => void
  handleSubmit: (e: React.FormEvent) => void
  handleQuery: (
    query: string,
    documentContent?: string,
    documents?: Array<{ name: string }>,
    imageData?: Array<{ base64: string; mimeType: string }>,
    systemPromptOverride?: string,
  ) => void
  cancelGeneration: () => Promise<void>
  getApiKey: () => Promise<string>
}

export function useChatMessaging({
  systemPrompt,
  rules = '',
  storeHistory,
  isPremium,
  models,
  selectedModel,
  chats,
  currentChat,
  setChats,
  setCurrentChat,
  messagesEndRef,
}: UseChatMessagingProps): UseChatMessagingReturn {
  const { getToken, isSignedIn } = useAuth()
  const { apiKey, getApiKey: getApiKeyFromHook } = useApiKey()
  const maxMessages = useMaxMessages()

  // Initialize r2Storage with token getter
  useEffect(() => {
    r2Storage.setTokenGetter(getToken)
  }, [getToken])

  const [input, setInput] = useState('')
  const [loadingState, setLoadingState] = useState<LoadingState>('idle')
  const [abortController, setAbortController] =
    useState<AbortController | null>(null)
  const [isThinking, setIsThinking] = useState(false)
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const currentChatIdRef = useRef<string>(currentChat?.id || '')
  const isStreamingRef = useRef(false)
  const thinkingStartTimeRef = useRef<number | null>(null)

  // Helper to calculate thinking duration and reset timer
  const getThinkingDuration = () => {
    const duration = thinkingStartTimeRef.current
      ? (Date.now() - thinkingStartTimeRef.current) / 1000
      : undefined
    thinkingStartTimeRef.current = null
    return duration
  }

  // Override model selection for free users - use first available free model
  const effectiveModel = !storeHistory
    ? (() => {
        // Find the first free chat model
        const firstFreeModel = models.find(
          (model) =>
            model.type === 'chat' &&
            model.chat === true &&
            (model.paid === undefined || model.paid === false),
        )

        // Use first free model if found, otherwise fallback to default
        return firstFreeModel?.modelName || CONSTANTS.DEFAULT_MODEL
      })()
    : selectedModel

  // A modified version of updateChat that respects the storeHistory flag
  const updateChatWithHistoryCheck = useCallback(
    (
      chatId: string,
      newMessages: Message[],
      immediate = false,
      isThinking = false,
    ) => {
      // Prevent redundant identical updates that could cause render thrashing
      const lastMessage = newMessages[newMessages.length - 1]
      // Create a simple hash of the content to ensure we don't miss different messages with same length
      const contentHash = lastMessage?.content
        ? Array.from(lastMessage.content)
            .reduce(
              (hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0,
              0,
            )
            .toString(36)
        : '0'
      const thoughtsHash = lastMessage?.thoughts
        ? Array.from(lastMessage.thoughts)
            .reduce(
              (hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0,
              0,
            )
            .toString(36)
        : '0'
      const updateKey = `${chatId}|${newMessages.length}|${contentHash}|${thoughtsHash}|${isThinking ? '1' : '0'}`
      ;(updateChatWithHistoryCheck as any)._lastKey ??= ''
      if ((updateChatWithHistoryCheck as any)._lastKey === updateKey) {
        return
      }
      ;(updateChatWithHistoryCheck as any)._lastKey = updateKey

      let updatedChat: Chat | undefined
      const isForCurrentChat = chatId === currentChatIdRef.current

      // Only update currentChat state if we're updating the currently viewed chat
      if (isForCurrentChat) {
        setCurrentChat((prevChat) => {
          updatedChat = {
            ...prevChat,
            messages: newMessages,
          }
          return updatedChat
        })
      }

      // Always reflect changes in the chats array and capture the updated chat
      setChats((prevChats) =>
        prevChats.map((c) => {
          if (c.id === chatId) {
            const mapped = { ...c, messages: newMessages }
            // If current chat wasn't updated above (not active), capture from list
            if (!isForCurrentChat) {
              updatedChat = mapped
            }
            return mapped
          }
          return c
        }),
      )

      // Save to storage (skip during thinking state unless immediate)
      if ((!isThinking || immediate) && updatedChat) {
        if (storeHistory) {
          // Skip cloud sync during streaming (unless immediate flag is set for final save)
          const skipCloudSync = isStreamingRef.current && !immediate

          chatStorage
            .saveChat(updatedChat, skipCloudSync)
            .then((savedChat) => {
              // Only update if the ID actually changed
              if (savedChat.id !== updatedChat!.id) {
                const originalChatId = updatedChat!.id
                currentChatIdRef.current = savedChat.id
                // Only update current chat if it's the one being viewed
                if (isForCurrentChat) {
                  setCurrentChat(savedChat)
                }
                setChats((prevChats) =>
                  prevChats.map((c) =>
                    c.id === originalChatId ? savedChat : c,
                  ),
                )
              }
            })
            .catch((error) => {
              logError('Failed to save chat during update', error, {
                component: 'useChatMessaging',
              })
            })
        } else {
          // Save to session storage for non-signed-in users
          sessionChatStorage.saveChat(updatedChat)
        }
      }
    },
    [storeHistory, setChats, setCurrentChat],
  )

  // Cancel generation function
  const cancelGeneration = useCallback(async () => {
    if (abortController) {
      abortController.abort()
      setAbortController(null)
    }
    setLoadingState('idle')
    setIsThinking(false)
    setIsWaitingForResponse(false)
    thinkingStartTimeRef.current = null

    // If we're in thinking mode, remove the last message if it's a thinking message
    if (isStreamingRef.current) {
      setChats((prevChats) => {
        const newChats = prevChats.map((chat) => {
          if (chat.id === currentChatIdRef.current) {
            // Remove the last message if it's a thinking message
            const messages = chat.messages.filter(
              (msg, idx) =>
                !(idx === chat.messages.length - 1 && msg.isThinking),
            )
            return { ...chat, messages }
          }
          return chat
        })
        // Find and save the updated chat
        const updatedChat = newChats.find(
          (c) => c.id === currentChatIdRef.current,
        )
        if (updatedChat) {
          if (storeHistory) {
            chatStorage
              .saveChatAndSync(updatedChat)
              .then((savedChat) => {
                // Only update if the ID actually changed
                if (savedChat.id !== updatedChat.id) {
                  currentChatIdRef.current = savedChat.id
                  setCurrentChat(savedChat)
                  setChats((prevChats) =>
                    prevChats.map((c) =>
                      c.id === updatedChat.id ? savedChat : c,
                    ),
                  )
                }
              })
              .catch((error) => {
                logError('Failed to save chat after cancellation', error, {
                  component: 'useChatMessaging',
                })
              })
          } else {
            // Save to session storage for non-signed-in users
            sessionChatStorage.saveChat(updatedChat)
          }
        }
        return newChats
      })

      // Also update current chat
      setCurrentChat((prev) => {
        const messages = prev.messages.filter(
          (msg, idx) => !(idx === prev.messages.length - 1 && msg.isThinking),
        )
        return { ...prev, messages }
      })
    }

    // Wait for any pending state updates
    await new Promise((resolve) =>
      setTimeout(resolve, CONSTANTS.ASYNC_STATE_DELAY_MS),
    )
  }, [abortController, storeHistory, setChats, setCurrentChat])

  // Handle chat query
  const handleQuery = useCallback(
    async (
      query: string,
      documentContent?: string,
      documents?: Array<{ name: string }>,
      imageData?: Array<{ base64: string; mimeType: string }>,
      systemPromptOverride?: string,
    ) => {
      // Allow empty query only if systemPromptOverride is provided
      if ((!query.trim() && !systemPromptOverride) || loadingState !== 'idle')
        return

      // Safety check - ensure we have a current chat
      if (!currentChat) {
        logError('No current chat available', undefined, {
          component: 'useChatMessaging',
          action: 'handleQuery',
        })
        return
      }

      // Clear input immediately when send button is pressed
      setInput('')

      // Reset textarea height
      if (inputRef.current) {
        inputRef.current.style.height = 'auto'
      }

      const controller = new AbortController()
      setAbortController(controller)
      setLoadingState('loading')
      setIsWaitingForResponse(true)

      // Only create a user message if there's actual query content
      // When using system prompt override with empty query, skip user message
      const hasUserContent = query.trim() !== ''

      const userMessage: Message | null = hasUserContent
        ? {
            role: 'user',
            content: query,
            documentContent: documentContent,
            documents,
            imageData,
            timestamp: new Date(),
          }
        : null

      // Generate title immediately if this is the first message
      let updatedChat = { ...currentChat }
      const isFirstMessage = currentChat.messages.length === 0

      if (isFirstMessage) {
        // Use query for title if available, otherwise extract from system prompt
        const titleSource =
          query.trim() || (systemPromptOverride ? 'Assistant Task' : 'New Chat')
        const title = generateTitle(titleSource)
        // Make sure title is not empty
        const safeTitle =
          title.trim() || 'Chat about ' + titleSource.slice(0, 20) + '...'

        // Update the current chat with:
        // - New title
        // - Clear blank flag
        // - Update createdAt to now (when first message is sent)
        updatedChat = {
          ...currentChat,
          title: safeTitle,
          isBlankChat: false,
          createdAt: new Date(), // Set creation time to when first message is sent
        }
      }

      const updatedMessages = userMessage
        ? [...currentChat.messages, userMessage]
        : [...currentChat.messages]
      updatedChat = {
        ...updatedChat,
        messages: updatedMessages,
        isBlankChat: false, // Clear blank chat flag when first message is sent
      }

      // Update the current chat and chats array immediately
      setCurrentChat(updatedChat)
      setChats((prevChats) =>
        prevChats.map((chat) =>
          chat.id === currentChat.id ? updatedChat : chat,
        ),
      )

      // Handle chat saving based on user status
      if (storeHistory) {
        // For signed-in users
        if (currentChat.hasTemporaryId) {
          try {
            // Get server ID synchronously before proceeding
            const result = await r2Storage.generateConversationId()
            if (result) {
              // Update the chat with the server ID
              const chatWithServerId = {
                ...updatedChat,
                id: result.conversationId,
                hasTemporaryId: false,
              }

              // Update refs and state with new ID
              currentChatIdRef.current = result.conversationId
              setCurrentChat(chatWithServerId)
              setChats((prevChats) =>
                prevChats.map((c) =>
                  c.id === currentChat.id ? chatWithServerId : c,
                ),
              )

              // Save the chat with server ID
              await chatStorage.saveChatAndSync(chatWithServerId)

              // Use the updated chat for the rest of the function
              updatedChat = chatWithServerId
            }
          } catch (error) {
            logError('Failed to get server ID for new chat', error, {
              component: 'useChatMessaging',
              action: 'handleQuery',
            })
            // Continue with temporary ID if server ID fetch fails
          }
        } else {
          // For existing chats, just save normally
          chatStorage.saveChatAndSync(updatedChat).catch((error) => {
            logError('Failed to save chat', error, {
              component: 'useChatMessaging',
            })
          })
        }
      } else {
        // For non-signed-in users, always save to sessionStorage
        sessionChatStorage.saveChat(updatedChat)
      }

      // Initial scroll after user message is added
      setTimeout(() => scrollToBottom(messagesEndRef, 'auto'), 0)

      let assistantMessage: Message | null = null
      // Track the initial chat ID for streaming tracker
      const streamingChatId = updatedChat.id

      try {
        isStreamingRef.current = true

        // Track streaming start for the current chat
        if (streamingChatId) {
          streamingTracker.startStreaming(streamingChatId)
        }

        assistantMessage = {
          role: 'assistant',
          content: '',
          timestamp: new Date(),
        }

        const model = models.find((model) => model.modelName === effectiveModel)
        if (!model) {
          throw new Error(`Model ${effectiveModel} not found`)
        }

        // Always use the proxy
        const proxyUrl = `${CONSTANTS.INFERENCE_PROXY_URL}${model.endpoint}`

        const baseSystemPrompt = systemPromptOverride || systemPrompt
        let finalSystemPrompt = baseSystemPrompt.replace(
          '{MODEL_NAME}',
          model.name,
        )

        // Always append rules if they exist
        if (rules) {
          // Apply same replacements to rules
          const processedRules = rules.replace('{MODEL_NAME}', model.name)
          finalSystemPrompt += '\n' + processedRules
        }

        const response = await fetch(proxyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await getApiKeyFromHook()}`,
          },
          body: JSON.stringify({
            model: model.modelName,
            messages: [
              // System prompt is always included even when messages are cut off
              {
                role: 'system',
                content: finalSystemPrompt,
              },
              // Include message history with a limit
              ...updatedMessages.slice(-maxMessages).map((msg) => {
                // Check if this message has image data AND the current model supports multimodal
                if (
                  msg.imageData &&
                  msg.imageData.length > 0 &&
                  model.multimodal
                ) {
                  // Create multimodal content array
                  const content = [
                    {
                      type: 'text',
                      text: msg.documentContent
                        ? `${msg.content}\n\n${msg.documents?.map((doc) => `Document title: ${doc.name}\nDocument contents:\n${msg.documentContent}`).join('\n\n') || `Document contents:\n${msg.documentContent}`}`
                        : msg.content,
                    },
                    // Add each image as a separate content item
                    ...msg.imageData.map((imgData) => ({
                      type: 'image_url',
                      image_url: {
                        url: `data:${imgData.mimeType};base64,${imgData.base64}`,
                      },
                    })),
                  ]

                  return {
                    role: msg.role,
                    content,
                  }
                } else {
                  // Standard text message (or image data stripped for non-multimodal models)
                  return {
                    role: msg.role,
                    content: msg.documentContent
                      ? `${msg.content}\n\n${msg.documents?.map((doc) => `Document title: ${doc.name}\nDocument contents:\n${msg.documentContent}`).join('\n\n') || `Document contents:\n${msg.documentContent}`}`
                      : msg.content,
                  }
                }
              }),
            ],
            stream: true,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new ChatError(
            `Server returned ${response.status}: ${response.statusText}`,
            'FETCH_ERROR',
          )
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let thoughtsBuffer = ''
        let isInThinkingMode = false
        let isFirstChunk = true
        let initialContentBuffer = '' // Buffer for detecting <think> tag across chunks
        let sseBuffer = '' // Buffer for potentially incomplete SSE messages
        let isUsingReasoningFormat = false // Track if we're using reasoning_content format

        while (true) {
          const { done, value } = await reader!.read()
          if (done || currentChatIdRef.current !== updatedChat.id) {
            // Handle any remaining buffered content when stream ends
            if (isFirstChunk && initialContentBuffer.trim()) {
              // Process the buffered content even if it's less than 20 characters
              assistantMessage = {
                role: 'assistant',
                content: initialContentBuffer.trim(),
                timestamp: new Date(),
                isThinking: false,
              }
              if (currentChatIdRef.current === updatedChat.id) {
                const newMessages = [...updatedMessages, assistantMessage]
                updateChatWithHistoryCheck(
                  updatedChat.id,
                  newMessages,
                  false,
                  false,
                )
              }
            }
            // If we're still in thinking mode when the stream ends,
            // handle based on format
            else if (isInThinkingMode && thoughtsBuffer.trim()) {
              isInThinkingMode = false
              setIsThinking(false)
              const thinkingDuration = getThinkingDuration()

              if (isUsingReasoningFormat) {
                // For reasoning_content format, keep thoughts as thoughts
                assistantMessage = {
                  role: 'assistant',
                  content: '', // No regular content was received
                  thoughts: thoughtsBuffer.trim(),
                  timestamp: new Date(),
                  isThinking: false,
                  thinkingDuration,
                }
              } else {
                // For <think> format, convert thoughts to content
                assistantMessage = {
                  role: 'assistant',
                  content: thoughtsBuffer.trim(), // Convert thoughts to content
                  timestamp: new Date(),
                  isThinking: false,
                  thinkingDuration,
                }
              }
              if (currentChatIdRef.current === updatedChat.id) {
                const chatId = currentChatIdRef.current
                const newMessages = [...updatedMessages, assistantMessage]
                // Save to localStorage and update display
                updateChatWithHistoryCheck(
                  chatId,
                  newMessages,
                  true, // immediate = true for final save
                  false,
                )
              }
            }
            controller.abort()
            break
          }

          const chunk = decoder.decode(value)
          // Append new data to existing buffer
          sseBuffer += chunk

          // Process complete SSE messages
          const lines = sseBuffer.split('\n')
          // Keep the last line in the buffer as it might be incomplete
          sseBuffer = lines.pop() || ''

          for (const line of lines.filter((line) => line.trim() !== '')) {
            // Skip [DONE] line or other non-data lines
            if (line === 'data: [DONE]' || !line.startsWith('data: ')) continue

            try {
              // Extract the JSON data from the SSE format (remove 'data: ' prefix)
              const jsonData = line.replace(/^data: /, '')
              const json = JSON.parse(jsonData)

              // Check for reasoning_content format (alternative to <think> tags)
              // reasoning_content field exists when the key is present, even if empty string
              const hasReasoningContent =
                'reasoning_content' in (json.choices?.[0]?.delta || {}) ||
                'reasoning_content' in (json.choices?.[0]?.message || {})
              const reasoningContent =
                json.choices?.[0]?.message?.reasoning_content ||
                json.choices?.[0]?.delta?.reasoning_content ||
                ''

              // Extract content from the delta structure in OpenAI format
              let content = json.choices?.[0]?.delta?.content || ''

              // Detect start of reasoning_content format (when field appears for first time)
              if (
                hasReasoningContent &&
                !isUsingReasoningFormat &&
                !isInThinkingMode
              ) {
                // Start thinking mode for reasoning_content format
                isUsingReasoningFormat = true
                isInThinkingMode = true
                setIsThinking(true)
                thinkingStartTimeRef.current = Date.now()
                setIsWaitingForResponse(false)
                isFirstChunk = false // No need to buffer for reasoning_content

                // Only add non-empty reasoning content
                if (reasoningContent) {
                  thoughtsBuffer = reasoningContent
                  assistantMessage = {
                    ...assistantMessage,
                    thoughts: thoughtsBuffer,
                    isThinking: true,
                  }
                  if (currentChatIdRef.current === updatedChat.id) {
                    const chatId = currentChatIdRef.current
                    const newMessages = [...updatedMessages, assistantMessage]
                    updateChatWithHistoryCheck(chatId, newMessages, false, true)
                  }
                }
                continue
              } else if (isUsingReasoningFormat && hasReasoningContent) {
                // Continue with reasoning format (even if reasoning_content is empty)
                if (reasoningContent) {
                  // Only accumulate non-empty reasoning content
                  thoughtsBuffer += reasoningContent
                }

                // Check if regular content has appeared - this signals end of thinking
                if (content && isInThinkingMode) {
                  isInThinkingMode = false
                  setIsThinking(false)
                  const thinkingDuration = getThinkingDuration()

                  // Finalize the thoughts and start regular content
                  assistantMessage = {
                    ...assistantMessage,
                    thoughts: thoughtsBuffer.trim() || undefined,
                    content: content,
                    isThinking: false,
                    thinkingDuration,
                  }
                } else if (reasoningContent) {
                  // Still in thinking mode with new reasoning content
                  assistantMessage = {
                    ...assistantMessage,
                    thoughts: thoughtsBuffer,
                    isThinking: isInThinkingMode,
                  }
                }

                // Update UI if we have changes
                if (
                  (reasoningContent || content) &&
                  currentChatIdRef.current === updatedChat.id
                ) {
                  const chatId = currentChatIdRef.current
                  const newMessages = [...updatedMessages, assistantMessage]
                  updateChatWithHistoryCheck(
                    chatId,
                    newMessages,
                    false,
                    isInThinkingMode,
                  )
                }

                // Continue processing if we have content to handle below
                if (!content) {
                  continue
                }
              }

              // For reasoning_content format with content appearing
              if (isUsingReasoningFormat && content) {
                // Stop thinking if not already stopped
                if (isInThinkingMode) {
                  isInThinkingMode = false
                  setIsThinking(false)
                  const thinkingDuration = getThinkingDuration()
                  // Update the assistant message with the duration
                  assistantMessage = {
                    ...assistantMessage,
                    thinkingDuration,
                  }
                }

                // Update with content (thoughts already set above)
                assistantMessage = {
                  ...assistantMessage,
                  content: (assistantMessage.content || '') + content,
                  isThinking: false,
                }

                if (currentChatIdRef.current === updatedChat.id) {
                  const chatId = currentChatIdRef.current
                  const newMessages = [...updatedMessages, assistantMessage]
                  updateChatWithHistoryCheck(chatId, newMessages, false, false)
                }
                continue
              }

              // Skip initial buffering if we're using reasoning_content format
              if (!isUsingReasoningFormat) {
                // If we're still in the initial phase, buffer the content
                if (isFirstChunk) {
                  initialContentBuffer += content

                  // Check if we have enough content to determine if it starts with <think>
                  if (
                    initialContentBuffer.includes('<think>') ||
                    initialContentBuffer.length > 5 // Reduced from 20 to 5 for better responsiveness
                  ) {
                    isFirstChunk = false
                    content = initialContentBuffer
                    initialContentBuffer = ''

                    // Check for think tag in the complete buffer
                    if (content.includes('<think>')) {
                      isInThinkingMode = true
                      setIsThinking(true)
                      thinkingStartTimeRef.current = Date.now()
                      content = content.replace(/^[\s\S]*?<think>/, '') // Remove everything up to and including <think>
                    }

                    // Remove loading dots only after processing the first chunk
                    setIsWaitingForResponse(false)
                  } else {
                    continue // Keep buffering
                  }
                }
              }

              // Check for </think> tag anywhere in the content (only for <think> format, not reasoning_content)
              if (
                content.includes('</think>') &&
                isInThinkingMode &&
                !isUsingReasoningFormat
              ) {
                isInThinkingMode = false
                setIsThinking(false)
                const thinkingDuration = getThinkingDuration()

                // Split content at </think> tag
                const parts = content.split('</think>')
                const finalThoughts = (thoughtsBuffer + (parts[0] || '')).trim()

                // Combine any remaining content after the </think> tag
                const remainingContent = parts.slice(1).join('')

                assistantMessage = {
                  ...assistantMessage,
                  thoughts: finalThoughts || undefined,
                  isThinking: false,
                  thinkingDuration,
                }

                // Add remaining content if it exists
                if (remainingContent.trim()) {
                  assistantMessage.content =
                    (assistantMessage.content || '') + remainingContent
                }

                if (currentChatIdRef.current === updatedChat.id) {
                  const chatId = currentChatIdRef.current
                  const newMessages = [...updatedMessages, assistantMessage]
                  updateChatWithHistoryCheck(chatId, newMessages, false, false)
                }
                continue
              }

              // If still in thinking mode (for <think> format only, reasoning_content is handled above)
              if (isInThinkingMode && !isUsingReasoningFormat) {
                thoughtsBuffer += content
                assistantMessage = {
                  ...assistantMessage,
                  thoughts: thoughtsBuffer,
                  isThinking: true,
                }
                if (currentChatIdRef.current === updatedChat.id) {
                  const chatId = currentChatIdRef.current
                  const newMessages = [...updatedMessages, assistantMessage]

                  updateChatWithHistoryCheck(chatId, newMessages, false, true)
                }
              } else if (!isInThinkingMode) {
                // Not in thinking mode, append to regular content
                // For reasoning_content format, we've already transitioned out of thinking
                // For <think> format, we remove any think tags
                if (!isUsingReasoningFormat) {
                  content = content.replace(/<think>|<\/think>/g, '') // Remove any think tags
                }

                if (content) {
                  assistantMessage = {
                    ...assistantMessage,
                    content: (assistantMessage.content || '') + content,
                    isThinking: false,
                  }
                  if (currentChatIdRef.current === updatedChat.id) {
                    const chatId = currentChatIdRef.current
                    const newMessages = [...updatedMessages, assistantMessage]

                    updateChatWithHistoryCheck(
                      chatId,
                      newMessages,
                      false,
                      false,
                    )
                  }
                }
              }
            } catch (error) {
              logError('Failed to parse SSE line', error, {
                component: 'useChatMessaging',
                action: 'handleQuery',
                metadata: { line },
              })
              continue
            }
          }
        }

        // Final save after stream completes successfully
        if (assistantMessage.content || assistantMessage.thoughts) {
          // Use currentChatIdRef to get the most recent chat ID
          const chatId = currentChatIdRef.current
          if (chatId === updatedChat.id) {
            const finalMessages = [...updatedMessages, assistantMessage]
            updateChatWithHistoryCheck(
              chatId,
              finalMessages,
              true, // immediate = true for final save
              false,
            )
          } else {
            logWarning(
              'Chat ID changed during streaming, skipping final save',
              {
                component: 'useChatMessaging',
                action: 'handleQuery',
                metadata: {
                  originalChatId: updatedChat.id,
                  currentChatId: chatId,
                },
              },
            )
          }
        } else {
          logWarning('No assistant content to save after streaming', {
            component: 'useChatMessaging',
            action: 'handleQuery',
          })
        }
      } catch (error) {
        setIsWaitingForResponse(false) // Make sure to clear waiting state on error
        // Only log and show error message if it's not an abort error
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          logError('Chat query failed', error, {
            component: 'useChatMessaging',
            action: 'handleQuery',
          })

          const errorMessage: Message = {
            role: 'assistant',
            content: 'Sorry, I encountered an error. Please try again.',
            timestamp: new Date(),
            isError: true,
          }

          updateChatWithHistoryCheck(
            updatedChat.id,
            [...updatedMessages, errorMessage],
            true, // immediate = true to ensure error is saved
            false,
          )
        }
      } finally {
        setLoadingState('idle')
        setAbortController(null)
        isStreamingRef.current = false

        // Track streaming end using the initial chat ID
        if (streamingChatId) {
          streamingTracker.endStreaming(streamingChatId)
        }

        setIsThinking(false)
        thinkingStartTimeRef.current = null
        setIsWaitingForResponse(false) // Always ensure loading state is cleared

        // Ensure we trigger a final sync if we have content
        // This handles edge cases where the normal final save might not execute
        if (
          storeHistory &&
          assistantMessage &&
          (assistantMessage.content || assistantMessage.thoughts) &&
          currentChatIdRef.current === updatedChat.id
        ) {
          // Just trigger a sync without saving again to avoid duplicates
          // The latest content should already be in IndexedDB from streaming saves
          cloudSync.backupChat(currentChatIdRef.current).catch((error) => {
            logError('Failed to sync chat after streaming', error, {
              component: 'useChatMessaging',
              action: 'handleQuery.finally',
            })
          })
        }
      }
    },
    [
      loadingState,
      currentChat,
      storeHistory,
      setChats,
      setCurrentChat,
      models,
      effectiveModel,
      systemPrompt,
      getApiKeyFromHook,
      messagesEndRef,
      maxMessages,
      rules,
    ],
  )

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      e.stopPropagation()
      handleQuery(input)
    },
    [input, handleQuery],
  )

  // Update currentChatIdRef when currentChat changes
  useEffect(() => {
    currentChatIdRef.current = currentChat?.id || ''
  }, [currentChat])

  // Use the abstracted API key hook
  const getApiKey = getApiKeyFromHook

  return {
    input,
    loadingState,
    inputRef,
    isThinking,
    isWaitingForResponse,
    apiKey,
    setInput,
    handleSubmit,
    handleQuery,
    cancelGeneration,
    getApiKey,
  }
}
