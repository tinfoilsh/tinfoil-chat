/**
 * Chat messaging hook
 *
 * Responsibilities:
 * - Orchestrates user input → persistence, network streaming, and UI state
 * - Delegates heavy-lift to:
 *   - persistence: hooks/chat-persistence.ts (local/IndexedDB + cloud sync gating)
 *   - network: services/inference (request builder + fetch in inference-client)
 *   - streaming: hooks/streaming-processor.ts (SSE parsing and thinking mode)
 *
 * State invariants:
 * - currentChatIdRef always mirrors the canonical chat id (temporary → server id swaps)
 * - isStreamingRef is true only while processing an assistant response (used to defer cloud sync)
 * - thinkingStartTimeRef is set only while a model is in thinking/reasoning mode
 */
import { type BaseModel } from '@/app/config/models'
import { useApiKey } from '@/hooks/use-api-key'
import { r2Storage } from '@/services/cloud/r2-storage'
import { sendChatStream } from '@/services/inference/inference-client'
import { generateTitle } from '@/services/inference/title'
import { chatStorage } from '@/services/storage/chat-storage'
import { sessionChatStorage } from '@/services/storage/session-storage'
import { logError, logWarning } from '@/utils/error-handling'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CONSTANTS } from '../constants'
import type { Chat, LoadingState, Message } from '../types'
import { createUpdateChatWithHistoryCheck } from './chat-persistence'
import { processStreamingResponse } from './streaming-processor'
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
  scrollToBottom?: () => void
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
  scrollToBottom,
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

  // For users without storeHistory (free/non-signed-in), validate the selected model
  // Ensures we only hit free chat models; always allow 'dev-simulator' for local testing
  const effectiveModel = !storeHistory
    ? (() => {
        // Allow Dev Simulator for testing even when not signed in
        if (selectedModel === 'dev-simulator') {
          return selectedModel
        }

        // Check if the selected model is available for free users
        const selectedModelData = models.find(
          (model) => model.modelName === selectedModel,
        )

        // If selected model is free and available, use it
        if (
          selectedModelData &&
          selectedModelData.type === 'chat' &&
          selectedModelData.chat === true &&
          (selectedModelData.paid === undefined ||
            selectedModelData.paid === false)
        ) {
          return selectedModel
        }

        // Otherwise fall back to first free chat model
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
  // During streaming, we persist to IndexedDB but defer cloud backup unless immediate=true
  // When the backend assigns a new id, we atomically rewrite ids in both currentChat and chats
  const updateChatWithHistoryCheck = useMemo(
    () =>
      createUpdateChatWithHistoryCheck({
        storeHistory,
        isStreamingRef,
        currentChatIdRef,
      }),
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
  // Lifecycle overview:
  // 1) Early exits + input reset
  // 2) Optimistic state update with the user message (and server id acquisition if needed)
  // 3) Persist initial state (session or IndexedDB)
  // 4) Start streaming via inference client
  // 5) streaming-processor applies batched updates until completion
  // 6) Finalize: optional title generation, final save
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

      // Track if this is the first message for title generation
      let updatedChat = { ...currentChat }
      const isFirstMessage = currentChat.messages.length === 0

      if (isFirstMessage) {
        // For first message, just use a temporary title
        // Real title will be generated after assistant response
        updatedChat = {
          ...currentChat,
          title: 'New Chat',
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
      if (scrollToBottom) {
        setTimeout(() => scrollToBottom(), 0)
      }

      try {
        const model = models.find((m) => m.modelName === effectiveModel)
        if (!model) {
          throw new Error(`Model ${effectiveModel} not found`)
        }

        const baseSystemPrompt = systemPromptOverride || systemPrompt
        const response = await sendChatStream({
          model,
          systemPrompt: baseSystemPrompt,
          rules,
          updatedMessages,
          maxMessages,
          getApiKey: getApiKeyFromHook,
          signal: controller.signal,
        })

        const assistantMessage = await processStreamingResponse(response, {
          updatedChat,
          updatedMessages,
          isFirstMessage,
          modelsLength: models.length,
          currentChatIdRef,
          isStreamingRef,
          thinkingStartTimeRef,
          setIsThinking,
          setIsWaitingForResponse,
          updateChatWithHistoryCheck,
          setChats,
          setCurrentChat,
          setLoadingState,
          storeHistory,
        })

        if (
          assistantMessage &&
          (assistantMessage.content || assistantMessage.thoughts)
        ) {
          const chatId = currentChatIdRef.current
          if (chatId === updatedChat.id) {
            const finalMessages = [...updatedMessages, assistantMessage]

            if (
              isFirstMessage &&
              updatedChat.title === 'New Chat' &&
              models.length > 0
            ) {
              try {
                let freeModel = models.find((m) => m.modelName === 'llama-free')
                if (!freeModel) {
                  freeModel = models.find(
                    (m) =>
                      m.type === 'chat' &&
                      m.chat === true &&
                      (m.paid === false || m.paid === undefined),
                  )
                }

                if (freeModel) {
                  const titleMessages = finalMessages.map((msg) => ({
                    role: msg.role,
                    content: msg.content || '',
                  }))
                  const generatedTitle = await generateTitle(
                    titleMessages,
                    apiKey,
                    freeModel.modelName,
                    freeModel.endpoint,
                  )
                  if (generatedTitle && generatedTitle !== 'New Chat') {
                    updatedChat = { ...updatedChat, title: generatedTitle }
                    setChats((prevChats) =>
                      prevChats.map((c) =>
                        c.id === chatId ? { ...c, title: generatedTitle } : c,
                      ),
                    )
                  }
                } else {
                  logWarning('No free model found for title generation', {
                    component: 'useChatMessaging',
                    action: 'generateTitle',
                  })
                }
              } catch (error) {
                logError('Title generation error', error, {
                  component: 'useChatMessaging',
                  action: 'generateTitle',
                })
              }
            }

            updateChatWithHistoryCheck(
              setChats,
              updatedChat,
              setCurrentChat,
              chatId,
              finalMessages,
              true,
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
        // Ensure UI loading flags are reset on pre-stream errors
        setIsWaitingForResponse(false)
        setLoadingState('idle')
        setIsThinking(false)
        isStreamingRef.current = false
        thinkingStartTimeRef.current = null
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
            setChats,
            updatedChat,
            setCurrentChat,
            updatedChat.id,
            [...updatedMessages, errorMessage],
            true,
            false,
          )
        }
      } finally {
        setAbortController(null)
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
      apiKey,
      maxMessages,
      rules,
      updateChatWithHistoryCheck,
      scrollToBottom,
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
