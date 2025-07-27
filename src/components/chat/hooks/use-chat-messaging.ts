import { type BaseModel } from '@/app/config/models'
import { useApiKey } from '@/hooks/use-api-key'
import { chatStorage } from '@/services/storage/chat-storage'
import { logError } from '@/utils/error-handling'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useRef, useState } from 'react'
import { scrollToBottom } from '../chat-messages'
import { ChatError, generateTitle } from '../chat-utils'
import { CONSTANTS } from '../constants'
import type { Chat, LoadingState, Message } from '../types'
import { useMaxMessages } from './use-max-messages'

// Utility function to remove imageData from messages before localStorage storage
// This prevents hitting browser storage quotas since base64 images can be very large
const stripImageDataForStorage = (chats: Chat[]): Chat[] => {
  return chats.map((chat) => ({
    ...chat,
    messages: chat.messages.map((msg) => {
      const { imageData, ...msgWithoutImageData } = msg
      return msgWithoutImageData
    }),
  }))
}

interface UseChatMessagingProps {
  systemPrompt: string
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
  ) => void
  cancelGeneration: () => Promise<void>
  getApiKey: () => Promise<string>
}

export function useChatMessaging({
  systemPrompt,
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
  const { getToken } = useAuth()
  const { apiKey, getApiKey: getApiKeyFromHook } = useApiKey()
  const maxMessages = useMaxMessages()

  const [input, setInput] = useState('')
  const [loadingState, setLoadingState] = useState<LoadingState>('idle')
  const [abortController, setAbortController] =
    useState<AbortController | null>(null)
  const [isThinking, setIsThinking] = useState(false)
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const currentChatIdRef = useRef<string>(currentChat.id)
  const isStreamingRef = useRef(false)

  // Override model selection for free users
  const effectiveModel = !storeHistory
    ? CONSTANTS.DEFAULT_FREE_MODEL
    : selectedModel

  // A modified version of updateChat that respects the storeHistory flag
  const updateChatWithHistoryCheck = useCallback(
    (
      setChats: React.Dispatch<React.SetStateAction<Chat[]>>,
      currentChat: Chat,
      setCurrentChat: React.Dispatch<React.SetStateAction<Chat>>,
      chatId: string,
      newMessages: Message[],
      immediate = false,
      isThinking = false,
    ) => {
      // Create the updated chat object first
      const updatedChat: Chat = {
        ...currentChat,
        messages: newMessages,
      }

      setChats((prevChats) => {
        // Find the latest version of this chat (to preserve any recent title changes)
        const existingChat = prevChats.find((c) => c.id === chatId)

        if (existingChat) {
          // Merge with existing chat to preserve title and other properties
          const mergedChat = {
            ...existingChat,
            messages: newMessages,
          }

          // Build new array
          const newChats = prevChats.map((c) =>
            c.id === chatId ? mergedChat : c,
          )

          return newChats
        }

        // If chat doesn't exist in the array, add it
        return prevChats
      })

      // Update current chat state
      setCurrentChat(updatedChat)

      // Persist if needed
      if (storeHistory && (!isThinking || immediate)) {
        // Save the updated chat to storage asynchronously
        chatStorage.saveChat(updatedChat).catch((error) => {
          logError('Failed to save chat during update', error, {
            component: 'useChatMessaging',
          })
        })
      }
    },
    [storeHistory],
  )

  // Cancel generation function
  const cancelGeneration = useCallback(async () => {
    if (abortController) {
      abortController.abort()
      setAbortController(null)
    }
    setLoadingState('idle')
    setIsThinking(false)

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
        if (storeHistory) {
          // Find and save the updated chat
          const updatedChat = newChats.find(
            (c) => c.id === currentChatIdRef.current,
          )
          if (updatedChat) {
            chatStorage.saveChat(updatedChat).catch((error) => {
              logError('Failed to save chat after cancellation', error, {
                component: 'useChatMessaging',
              })
            })
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
    ) => {
      if (!query.trim() || loadingState !== 'idle') return

      const controller = new AbortController()
      setAbortController(controller)
      setLoadingState('loading')
      setIsWaitingForResponse(true)

      const userMessage: Message = {
        role: 'user',
        content: query,
        documentContent: documentContent,
        documents,
        imageData,
        timestamp: new Date(),
      }

      // Generate title immediately if this is the first message
      let updatedChat = { ...currentChat }

      if (currentChat.messages.length === 0 && storeHistory) {
        const title = generateTitle(query)
        // Make sure title is not empty
        const safeTitle =
          title.trim() || 'Chat about ' + query.slice(0, 20) + '...'

        // Update the current chat with the new title
        updatedChat = { ...currentChat, title: safeTitle }
        setCurrentChat(updatedChat)

        // Update all chats in state and localStorage
        const updatedChatsWithTitle = chats.map((chat) =>
          chat.id === currentChat.id ? { ...chat, title: safeTitle } : chat,
        )

        setChats(updatedChatsWithTitle)
        if (storeHistory) {
          // Save the updated chat with new title
          chatStorage.saveChat(updatedChat).catch((error) => {
            logError('Failed to save chat with new title', error, {
              component: 'useChatMessaging',
            })
          })
        }
      }

      const updatedMessages = [...currentChat.messages, userMessage]
      updatedChat = { ...updatedChat, messages: updatedMessages }

      // Update the current chat with the new messages
      setCurrentChat(updatedChat)

      // Update chats array with both title and messages
      setChats((prevChats) => {
        const newChats = prevChats.map((chat) =>
          chat.id === currentChat.id ? updatedChat : chat,
        )

        if (storeHistory) {
          // Save the updated chat with user message
          chatStorage.saveChat(updatedChat).catch((error) => {
            logError('Failed to save chat with user message', error, {
              component: 'useChatMessaging',
            })
          })
        }

        return newChats
      })

      setInput('')

      // Reset textarea height
      if (inputRef.current) {
        inputRef.current.style.height = 'auto'
      }

      // Initial scroll after user message is added
      setTimeout(() => scrollToBottom(messagesEndRef, 'auto'), 0)

      try {
        isStreamingRef.current = true

        let assistantMessage: Message = {
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

        const finalSystemPrompt = systemPrompt.replace(
          '{MODEL_NAME}',
          model.name,
        )

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

        while (true) {
          const { done, value } = await reader!.read()
          if (done || currentChatIdRef.current !== currentChat.id) {
            // Handle any remaining buffered content when stream ends
            if (isFirstChunk && initialContentBuffer.trim()) {
              // Process the buffered content even if it's less than 20 characters
              assistantMessage = {
                role: 'assistant',
                content: initialContentBuffer.trim(),
                timestamp: new Date(),
                isThinking: false,
              }
              if (currentChatIdRef.current === currentChat.id) {
                const newMessages = [...updatedMessages, assistantMessage]
                updateChatWithHistoryCheck(
                  setChats,
                  currentChat,
                  setCurrentChat,
                  currentChat.id,
                  newMessages,
                  false,
                  false,
                )
              }
            }
            // If we're still in thinking mode when the stream ends,
            // convert thoughts into regular message content
            else if (isInThinkingMode && thoughtsBuffer.trim()) {
              isInThinkingMode = false
              setIsThinking(false)
              assistantMessage = {
                role: 'assistant',
                content: thoughtsBuffer.trim(), // Convert thoughts to content
                timestamp: new Date(),
                isThinking: false,
              }
              if (currentChatIdRef.current === currentChat.id) {
                const newMessages = [...updatedMessages, assistantMessage]
                // Save to localStorage and update display
                updateChatWithHistoryCheck(
                  setChats,
                  currentChat,
                  setCurrentChat,
                  currentChat.id,
                  newMessages,
                  false,
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

              // Extract content from the delta structure in OpenAI format
              let content = json.choices?.[0]?.delta?.content || ''

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
                    content = content.replace(/^[\s\S]*?<think>/, '') // Remove everything up to and including <think>
                  }

                  // Remove loading dots only after processing the first chunk
                  setIsWaitingForResponse(false)
                } else {
                  continue // Keep buffering
                }
              }

              // Check for </think> tag anywhere in the content
              if (content.includes('</think>') && isInThinkingMode) {
                isInThinkingMode = false
                setIsThinking(false)

                // Split content at </think> tag
                const parts = content.split('</think>')
                const finalThoughts = (thoughtsBuffer + (parts[0] || '')).trim()

                // Combine any remaining content after the </think> tag
                const remainingContent = parts.slice(1).join('')

                assistantMessage = {
                  ...assistantMessage,
                  thoughts: finalThoughts || undefined,
                  isThinking: false,
                }

                // Add remaining content if it exists
                if (remainingContent.trim()) {
                  assistantMessage.content =
                    (assistantMessage.content || '') + remainingContent
                }

                if (currentChatIdRef.current === currentChat.id) {
                  const newMessages = [...updatedMessages, assistantMessage]
                  updateChatWithHistoryCheck(
                    setChats,
                    currentChat,
                    setCurrentChat,
                    currentChat.id,
                    newMessages,
                    false,
                    false,
                  )
                }
                continue
              }

              // If still in thinking mode
              if (isInThinkingMode) {
                thoughtsBuffer += content
                assistantMessage = {
                  ...assistantMessage,
                  thoughts: thoughtsBuffer,
                  isThinking: true,
                }
                if (currentChatIdRef.current === currentChat.id) {
                  const newMessages = [...updatedMessages, assistantMessage]

                  // Get the current chat with its potentially updated title
                  const currentChatWithTitle =
                    chats.find((c) => c.id === currentChat.id) || currentChat

                  updateChatWithHistoryCheck(
                    setChats,
                    currentChatWithTitle,
                    setCurrentChat,
                    currentChat.id,
                    newMessages,
                    false,
                    true,
                  )
                }
              } else {
                // Not in thinking mode, append to regular content
                content = content.replace(/<think>|<\/think>/g, '') // Remove any think tags
                assistantMessage = {
                  ...assistantMessage,
                  content: (assistantMessage.content || '') + content,
                  isThinking: false,
                }
                if (currentChatIdRef.current === currentChat.id) {
                  const newMessages = [...updatedMessages, assistantMessage]

                  // Get the current chat with its potentially updated title
                  const currentChatWithTitle =
                    chats.find((c) => c.id === currentChat.id) || currentChat

                  updateChatWithHistoryCheck(
                    setChats,
                    currentChatWithTitle,
                    setCurrentChat,
                    currentChat.id,
                    newMessages,
                    false,
                    false,
                  )
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

          // Get the current chat with its potentially updated title
          const currentChatWithTitle =
            chats.find((c) => c.id === currentChat.id) || currentChat

          updateChatWithHistoryCheck(
            setChats,
            currentChatWithTitle,
            setCurrentChat,
            currentChat.id,
            [...updatedMessages, errorMessage],
            false,
            false,
          )
        }
      } finally {
        setLoadingState('idle')
        setAbortController(null)
        isStreamingRef.current = false
        setIsThinking(false)
        setIsWaitingForResponse(false) // Always ensure loading state is cleared
      }
    },
    [
      loadingState,
      currentChat,
      storeHistory,
      chats,
      setChats,
      setCurrentChat,
      models,
      effectiveModel,
      systemPrompt,
      getApiKeyFromHook,
      messagesEndRef,
      updateChatWithHistoryCheck,
      maxMessages,
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
    currentChatIdRef.current = currentChat.id
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
