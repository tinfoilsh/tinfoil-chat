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
import { useProject } from '@/components/project'
import { type BaseModel } from '@/config/models'
import { sendChatStream } from '@/services/inference/inference-client'
import { setSubscriptionChecker } from '@/services/inference/tinfoil-client'
import { generateTitle } from '@/services/inference/title'
import { chatStorage } from '@/services/storage/chat-storage'
import { sessionChatStorage } from '@/services/storage/session-storage'
import { isCloudSyncEnabled } from '@/utils/cloud-sync-settings'
import { logError, logInfo, logWarning } from '@/utils/error-handling'
import { generateReverseId } from '@/utils/reverse-id'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CONSTANTS } from '../constants'
import type { Chat, LoadingState, Message } from '../types'
import { createBlankChat, sortChats } from './chat-operations'
import { createUpdateChatWithHistoryCheck } from './chat-persistence'
import { processStreamingResponse } from './streaming-processor'
import { useMaxMessages } from './use-max-messages'
import type { ReasoningEffort } from './use-reasoning-effort'

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
  reasoningEffort?: ReasoningEffort
  webSearchEnabled?: boolean
  piiCheckEnabled?: boolean
}

interface UseChatMessagingReturn {
  input: string
  loadingState: LoadingState
  retryInfo: { attempt: number; maxRetries: number; error?: string } | null
  inputRef: React.RefObject<HTMLTextAreaElement>
  isThinking: boolean
  isWaitingForResponse: boolean
  isStreaming: boolean
  setInput: (input: string) => void
  handleSubmit: (e: React.FormEvent) => void
  handleQuery: (
    query: string,
    documentContent?: string,
    multimodalText?: string,
    documents?: Array<{ name: string }>,
    imageData?: Array<{ base64: string; mimeType: string }>,
    systemPromptOverride?: string,
    baseMessages?: Message[],
  ) => void
  cancelGeneration: () => Promise<void>
  editMessage: (messageIndex: number, newContent: string) => void
  regenerateMessage: (messageIndex: number) => void
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
  reasoningEffort,
  webSearchEnabled,
  piiCheckEnabled,
}: UseChatMessagingProps): UseChatMessagingReturn {
  const { isSignedIn } = useAuth()
  const maxMessages = useMaxMessages()
  const { isProjectMode, activeProject } = useProject()

  // Track isPremium in a ref so the subscription checker always has current value
  const isPremiumRef = useRef(isPremium)
  useEffect(() => {
    isPremiumRef.current = isPremium
  }, [isPremium])

  // Initialize subscription checker for tinfoil client
  useEffect(() => {
    setSubscriptionChecker(() => isPremiumRef.current)
  }, [])

  const [input, setInput] = useState('')
  const [loadingState, setLoadingState] = useState<LoadingState>('idle')
  const [retryInfo, setRetryInfo] = useState<{
    attempt: number
    maxRetries: number
    error?: string
  } | null>(null)
  const [abortController, setAbortController] =
    useState<AbortController | null>(null)
  const [isThinking, setIsThinking] = useState(false)
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const currentChatIdRef = useRef<string>(currentChat?.id || '')
  const isStreamingRef = useRef(false)
  const thinkingStartTimeRef = useRef<number | null>(null)
  const titleGeneratedRef = useRef(false)
  const generatedTitleRef = useRef<string | null>(null)
  const earlyTitlePromiseRef = useRef<Promise<void> | null>(null)

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
        if (selectedModelData && selectedModelData.paid === false) {
          return selectedModel
        }

        // Otherwise fall back to first free chat model
        const firstFreeModel = models.find((model) => model.paid === false)

        // Use first free model if found, otherwise fallback to selected model as last resort
        return firstFreeModel?.modelName || selectedModel
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
    setRetryInfo(null)
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
      multimodalText?: string,
      documents?: Array<{ name: string }>,
      imageData?: Array<{ base64: string; mimeType: string }>,
      systemPromptOverride?: string,
      baseMessages?: Message[],
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
        inputRef.current.style.height = CONSTANTS.INPUT_MIN_HEIGHT
      }

      const controller = new AbortController()
      setAbortController(controller)
      setLoadingState('loading')
      setIsWaitingForResponse(true)
      setIsStreaming(true)

      // Only create a user message if there's actual query content
      // When using system prompt override with empty query, skip user message
      const hasUserContent = query.trim() !== ''

      const userMessage: Message | null = hasUserContent
        ? {
            role: 'user',
            content: query,
            documentContent: documentContent,
            multimodalText: multimodalText,
            documents,
            imageData,
            timestamp: new Date(),
          }
        : null

      // Track if this is the first message for a blank chat
      let updatedChat = { ...currentChat }
      const isBlankChat = currentChat.isBlankChat === true
      const isFirstMessage = currentChat.messages.length === 0
      let updatedMessages: Message[] = []

      // Reset title generation flags for new chats
      if (isFirstMessage) {
        titleGeneratedRef.current = false
        generatedTitleRef.current = null
        earlyTitlePromiseRef.current = null
      }

      // Handle blank chat conversion: create chat immediately with server-valid ID
      if (isBlankChat && storeHistory) {
        logInfo('[handleQuery] Converting blank chat to real chat', {
          component: 'useChatMessaging',
          action: 'handleQuery.blankChatConversion',
          metadata: {
            isLocalOnly: currentChat.isLocalOnly,
            cloudSyncEnabled: isCloudSyncEnabled(),
          },
        })

        // Generate an ID that matches backend expectations: {reverseTimestamp}_{uuid}
        // This avoids temp→server ID rewrite races (URL/currentChat mismatches).
        const { id: chatId } = generateReverseId()
        updatedMessages = userMessage ? [userMessage] : []
        updatedChat = {
          ...currentChat,
          id: chatId,
          title: 'Untitled',
          messages: updatedMessages,
          isBlankChat: false,
          createdAt: new Date(),
          isLocalOnly: currentChat.isLocalOnly || !isCloudSyncEnabled(),
          pendingSave: true,
          projectId:
            isProjectMode && activeProject ? activeProject.id : undefined,
        }

        // Update state immediately for instant UI feedback
        currentChatIdRef.current = chatId
        setCurrentChat(updatedChat)

        // Replace the blank chat with the new real chat
        setChats((prevChats) => {
          // Filter out the current blank chat that we're converting
          const otherBlankChats = prevChats.filter(
            (c) => c.isBlankChat && c.isLocalOnly !== currentChat.isLocalOnly,
          )
          const nonBlankChats = prevChats.filter((c) => !c.isBlankChat)

          // Re-create the blank chat for this mode
          const newBlankChat = createBlankChat(currentChat.isLocalOnly)

          // Sort with blank chats first, then the new chat, then other chats
          return sortChats([
            ...otherBlankChats,
            newBlankChat,
            updatedChat,
            ...nonBlankChats,
          ])
        })

        // Scroll after state update and DOM renders
        if (scrollToBottom) {
          setTimeout(() => scrollToBottom(), 50)
        }

        // Save immediately (and sync if applicable). ID is already server-valid.
        chatStorage
          .saveChatAndSync(updatedChat)
          .then(() => {
            setChats((prevChats) =>
              prevChats.map((c) =>
                c.id === chatId ? { ...c, pendingSave: false } : c,
              ),
            )
            setCurrentChat((prev) =>
              prev.id === chatId ? { ...prev, pendingSave: false } : prev,
            )
          })
          .catch((error) => {
            logError('[handleQuery] Failed to save new chat', error, {
              component: 'useChatMessaging',
              action: 'handleQuery.initialSaveError',
              metadata: { chatId },
            })
            // Clear pendingSave flag even on error (keeps chat usable locally)
            setChats((prevChats) =>
              prevChats.map((c) =>
                c.id === chatId ? { ...c, pendingSave: false } : c,
              ),
            )
            setCurrentChat((prev) =>
              prev.id === chatId ? { ...prev, pendingSave: false } : prev,
            )
          })
      } else if (isBlankChat && !storeHistory) {
        // For non-signed-in users, create a session chat with a temporary ID
        updatedMessages = userMessage ? [userMessage] : []
        updatedChat = {
          ...currentChat,
          id: `session-${Date.now()}`,
          title: 'Untitled',
          messages: updatedMessages,
          isBlankChat: false,
          createdAt: new Date(),
          pendingSave: true,
        }

        currentChatIdRef.current = updatedChat.id
        setCurrentChat(updatedChat)

        // Replace blank chat with the new chat
        setChats((prevChats) => {
          const otherChats = prevChats.filter((c) => c !== currentChat)
          return [updatedChat, ...otherChats]
        })

        // Scroll after state update and DOM renders
        if (scrollToBottom) {
          setTimeout(() => scrollToBottom(), 50)
        }

        sessionChatStorage.saveChat(updatedChat)

        // Clear pendingSave flag immediately for session storage (it's synchronous)
        setTimeout(() => {
          setChats((prevChats) =>
            prevChats.map((c) =>
              c.id === updatedChat.id ? { ...c, pendingSave: false } : c,
            ),
          )
          setCurrentChat((prev) =>
            prev.id === updatedChat.id ? { ...prev, pendingSave: false } : prev,
          )
        }, 0)
      } else {
        // Not a blank chat, just update messages
        // Use baseMessages if provided (e.g., from editMessage), otherwise use currentChat.messages
        const existingMessages = baseMessages ?? currentChat.messages
        updatedMessages = userMessage
          ? [...existingMessages, userMessage]
          : [...existingMessages]

        updatedChat = {
          ...updatedChat,
          messages: updatedMessages,
        }

        setCurrentChat(updatedChat)
        setChats((prevChats) =>
          prevChats.map((chat) =>
            chat.id === currentChat.id ? updatedChat : chat,
          ),
        )

        // Scroll after state update and DOM renders
        if (scrollToBottom) {
          setTimeout(() => scrollToBottom(), 50)
        }

        // Save the updated chat
        if (storeHistory) {
          await chatStorage.saveChatAndSync(updatedChat)
        } else {
          sessionChatStorage.saveChat(updatedChat)
        }
      }

      // Capture the starting chat ID before any async operations that might change it
      const startingChatId = currentChatIdRef.current

      // Generate title immediately for first messages (based on user's message)
      if (isFirstMessage && userMessage) {
        const titleModel = models.find((m) => m.type === 'title')
        if (titleModel) {
          titleGeneratedRef.current = true
          const chatId = currentChatIdRef.current
          earlyTitlePromiseRef.current = (async () => {
            try {
              const titleMessages = [
                { role: 'user', content: userMessage.content || '' },
              ]
              const generatedTitle = await generateTitle(
                titleMessages,
                titleModel.modelName,
              )

              if (generatedTitle && generatedTitle !== 'Untitled') {
                logInfo('[handleQuery] Title generated from user message', {
                  component: 'useChatMessaging',
                  action: 'handleQuery.immediateTitleGen',
                  metadata: { chatId, title: generatedTitle },
                })

                generatedTitleRef.current = generatedTitle

                setCurrentChat((prev) =>
                  prev.id === chatId
                    ? { ...prev, title: generatedTitle }
                    : prev,
                )
                setChats((prevChats) =>
                  prevChats.map((c) =>
                    c.id === chatId ? { ...c, title: generatedTitle } : c,
                  ),
                )
              } else {
                titleGeneratedRef.current = false
              }
            } catch (error) {
              logError('Immediate title generation error', error, {
                component: 'useChatMessaging',
                action: 'generateTitle.immediate',
              })
              titleGeneratedRef.current = false
            }
          })()
        }
      }

      // Project memory is currently disabled - uncomment to re-enable
      // Trigger project memory update in parallel with streaming (if in project mode)
      // Uses updatedChat.projectId to avoid race condition if user switches projects during streaming
      // if (updatedChat.projectId && updatedMessages.length > 0) {
      //   projectEvents.emit({
      //     type: 'memory-update-needed',
      //     projectId: updatedChat.projectId,
      //     messages: updatedMessages,
      //   })
      // }

      try {
        const model = models.find((m) => m.modelName === effectiveModel)
        if (!model) {
          throw new Error(`Model ${effectiveModel} not found`)
        }

        logInfo('[handleQuery] Starting streaming with model', {
          component: 'useChatMessaging',
          action: 'handleQuery.startStreaming',
          metadata: {
            model: effectiveModel,
            chatId: currentChatIdRef.current,
            startingChatId,
            isLocalOnly: updatedChat.isLocalOnly,
            messageCount: updatedMessages.length,
          },
        })

        const baseSystemPrompt = systemPromptOverride || systemPrompt
        const response = await sendChatStream({
          model,
          systemPrompt: baseSystemPrompt,
          rules,
          onRetry: (attempt, maxRetries, error) => {
            setLoadingState('retrying')
            setRetryInfo({ attempt, maxRetries, error })
          },
          updatedMessages,
          maxMessages,
          signal: controller.signal,
          reasoningEffort,
          webSearchEnabled,
          piiCheckEnabled,
        })

        // Callback for early title generation (fallback if immediate generation didn't run)
        const handleEarlyTitleGeneration = (_content: string) => {
          if (titleGeneratedRef.current) return

          const titleModel = models.find((m) => m.type === 'title')
          if (!titleModel) return

          // Find the first user message for title generation
          const firstUserMessage = updatedMessages.find(
            (msg) => msg.role === 'user',
          )
          if (!firstUserMessage?.content) return

          titleGeneratedRef.current = true
          const chatId = currentChatIdRef.current

          // Store the promise so we can await it before final save
          earlyTitlePromiseRef.current = (async () => {
            try {
              const titleMessages = [
                { role: 'user', content: firstUserMessage.content || '' },
              ]
              const generatedTitle = await generateTitle(
                titleMessages,
                titleModel.modelName,
              )

              if (generatedTitle && generatedTitle !== 'Untitled') {
                logInfo('[handleQuery] Early title generated successfully', {
                  component: 'useChatMessaging',
                  action: 'handleQuery.earlyTitleGenComplete',
                  metadata: { chatId, title: generatedTitle },
                })

                // Store in ref so final save can use it
                generatedTitleRef.current = generatedTitle

                setCurrentChat((prev) =>
                  prev.id === chatId
                    ? { ...prev, title: generatedTitle }
                    : prev,
                )
                setChats((prevChats) =>
                  prevChats.map((c) =>
                    c.id === chatId ? { ...c, title: generatedTitle } : c,
                  ),
                )
              } else {
                // Reset flag to allow fallback title generation at end of stream
                titleGeneratedRef.current = false
              }
            } catch (error) {
              logError('Early title generation error', error, {
                component: 'useChatMessaging',
                action: 'generateTitle.early',
              })
              titleGeneratedRef.current = false
            }
          })()
        }

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
          setIsStreaming,
          updateChatWithHistoryCheck,
          setChats,
          setCurrentChat,
          setLoadingState,
          storeHistory,
          startingChatId,
          onEarlyTitleGeneration: handleEarlyTitleGeneration,
          titleGeneratedRef,
        })

        if (
          assistantMessage &&
          (assistantMessage.content ||
            assistantMessage.thoughts ||
            assistantMessage.webSearch)
        ) {
          const chatId = currentChatIdRef.current

          // If user navigated away during streaming, don't save to the new chat
          if (chatId !== updatedChat.id) {
            logInfo(
              '[handleQuery] User navigated away during streaming, skipping save',
              {
                component: 'useChatMessaging',
                action: 'handleQuery.navigationDuringStream',
                metadata: {
                  streamingChatId: updatedChat.id,
                  currentChatId: chatId,
                },
              },
            )
            return
          }

          logInfo('[handleQuery] Streaming completed, processing response', {
            component: 'useChatMessaging',
            action: 'handleQuery.streamingComplete',
            metadata: {
              chatId,
              isLocalOnly: updatedChat.isLocalOnly,
              hasContent: !!assistantMessage.content,
              hasThoughts: !!assistantMessage.thoughts,
              isFirstMessage,
            },
          })

          // Always save the response, using the current chat ID from the ref
          // which has been updated to the server ID if one was generated
          const finalMessages = [...updatedMessages, assistantMessage]

          // Get current best title (early-generated or default)
          const currentTitle = generatedTitleRef.current || updatedChat.title
          const chatToSave = {
            ...updatedChat,
            id: chatId,
            title: currentTitle,
            messages: finalMessages,
            pendingSave: false,
          }

          // IMMEDIATELY save chat content to IndexedDB to prevent data loss
          // Title generation happens async afterward
          logInfo(
            '[handleQuery] Saving chat content immediately after stream',
            {
              component: 'useChatMessaging',
              action: 'handleQuery.immediateSave',
              metadata: {
                chatId,
                isLocalOnly: chatToSave.isLocalOnly,
                title: chatToSave.title,
                messageCount: finalMessages.length,
                storeHistory,
              },
            },
          )

          updateChatWithHistoryCheck(
            setChats,
            chatToSave,
            setCurrentChat,
            chatId,
            finalMessages,
            false,
          )

          // Check if we need to generate a title
          const needsTitleGeneration =
            isFirstMessage &&
            currentTitle === 'Untitled' &&
            models.length > 0 &&
            !titleGeneratedRef.current

          if (needsTitleGeneration) {
            // Title generation happens async, doesn't block the save
            ;(async () => {
              // Wait for early title if in progress
              if (earlyTitlePromiseRef.current) {
                await earlyTitlePromiseRef.current
                // Check if early title succeeded
                if (
                  generatedTitleRef.current &&
                  generatedTitleRef.current !== 'Untitled'
                ) {
                  const earlyTitle = generatedTitleRef.current

                  // Update state with early title first (so updateChatWithHistoryCheck preserves it)
                  setCurrentChat((prev) =>
                    prev.id === chatId ? { ...prev, title: earlyTitle } : prev,
                  )
                  setChats((prevChats) =>
                    prevChats.map((c) =>
                      c.id === chatId ? { ...c, title: earlyTitle } : c,
                    ),
                  )

                  // Save again with the early title
                  const chatWithTitle = {
                    ...chatToSave,
                    title: earlyTitle,
                  }
                  updateChatWithHistoryCheck(
                    setChats,
                    chatWithTitle,
                    setCurrentChat,
                    chatId,
                    finalMessages,
                    false,
                  )
                  if (!updatedChat.isLocalOnly) {
                    const { cloudSync } = await import(
                      '@/services/cloud/cloud-sync'
                    )
                    cloudSync.backupChat(chatId).catch((error) => {
                      logError('Failed to sync chat after title', error, {
                        component: 'useChatMessaging',
                        action: 'handleQuery',
                        metadata: { chatId },
                      })
                    })
                  }
                  return
                }
              }

              // Generate fallback title
              try {
                const titleModel = models.find((m) => m.type === 'title')
                if (!titleModel) {
                  logWarning('No title model found for title generation', {
                    component: 'useChatMessaging',
                    action: 'generateTitle',
                  })
                  // No title model, just sync what we have
                  if (!updatedChat.isLocalOnly) {
                    const { cloudSync } = await import(
                      '@/services/cloud/cloud-sync'
                    )
                    cloudSync.backupChat(chatId).catch((error) => {
                      logError('Failed to sync chat', error, {
                        component: 'useChatMessaging',
                        action: 'handleQuery',
                        metadata: { chatId },
                      })
                    })
                  }
                  return
                }

                logInfo('[handleQuery] Generating title for new chat', {
                  component: 'useChatMessaging',
                  action: 'handleQuery.titleGenStart',
                  metadata: { chatId },
                })

                const titleMessages = finalMessages.map((msg) => ({
                  role: msg.role,
                  content: msg.content || '',
                }))
                const generatedTitle = await generateTitle(
                  titleMessages,
                  titleModel.modelName,
                )

                if (generatedTitle && generatedTitle !== 'Untitled') {
                  logInfo('[handleQuery] Title generated successfully', {
                    component: 'useChatMessaging',
                    action: 'handleQuery.titleGenComplete',
                    metadata: { chatId, title: generatedTitle },
                  })

                  // Update state with new title
                  setCurrentChat((prev) =>
                    prev.id === chatId
                      ? { ...prev, title: generatedTitle }
                      : prev,
                  )
                  setChats((prevChats) =>
                    prevChats.map((c) =>
                      c.id === chatId ? { ...c, title: generatedTitle } : c,
                    ),
                  )

                  // Save again with the generated title
                  const chatWithTitle = { ...chatToSave, title: generatedTitle }
                  updateChatWithHistoryCheck(
                    setChats,
                    chatWithTitle,
                    setCurrentChat,
                    chatId,
                    finalMessages,
                    false,
                  )
                }

                // Cloud sync after title generation (with or without new title)
                if (!updatedChat.isLocalOnly) {
                  const { cloudSync } = await import(
                    '@/services/cloud/cloud-sync'
                  )
                  cloudSync.backupChat(chatId).catch((error) => {
                    logError('Failed to sync chat after title', error, {
                      component: 'useChatMessaging',
                      action: 'handleQuery',
                      metadata: { chatId },
                    })
                  })
                }
              } catch (error) {
                logError('Title generation error', error, {
                  component: 'useChatMessaging',
                  action: 'generateTitle',
                })
                // Still sync even if title gen failed
                if (!updatedChat.isLocalOnly) {
                  const { cloudSync } = await import(
                    '@/services/cloud/cloud-sync'
                  )
                  cloudSync.backupChat(chatId).catch((error) => {
                    logError('Failed to sync chat', error, {
                      component: 'useChatMessaging',
                      action: 'handleQuery',
                      metadata: { chatId },
                    })
                  })
                }
              }
            })()
          } else {
            // No title generation needed, sync now
            if (!chatToSave.isLocalOnly) {
              import('@/services/cloud/cloud-sync').then(({ cloudSync }) => {
                cloudSync.backupChat(chatId).catch((error) => {
                  logError('Failed to sync chat after completion', error, {
                    component: 'useChatMessaging',
                    action: 'handleQuery',
                    metadata: { chatId },
                  })
                })
              })
            } else {
              logInfo('[handleQuery] Skipping cloud sync for local-only chat', {
                component: 'useChatMessaging',
                action: 'handleQuery.skipCloudSync',
                metadata: {
                  chatId,
                  isLocalOnly: chatToSave.isLocalOnly,
                },
              })
            }
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
        setIsStreaming(false)
        setLoadingState('idle')
        setIsThinking(false)
        isStreamingRef.current = false
        thinkingStartTimeRef.current = null
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          logError('Chat query failed', error, {
            component: 'useChatMessaging',
            action: 'handleQuery',
          })

          const errorMsg =
            error instanceof Error ? error.message : 'Unknown error occurred'

          const errorMessage: Message = {
            role: 'assistant',
            content: `Error: ${errorMsg}`,
            timestamp: new Date(),
            isError: true,
          }

          // Use the current chat ID from ref which has the correct (possibly server) ID
          const currentId = currentChatIdRef.current || updatedChat.id
          updateChatWithHistoryCheck(
            setChats,
            { ...updatedChat, id: currentId, pendingSave: false },
            setCurrentChat,
            currentId,
            [...updatedMessages, errorMessage],
            false,
          )
        }
      } finally {
        // Ensure loading state is reset regardless of where failure occurs
        setLoadingState('idle')
        setRetryInfo(null)
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
      maxMessages,
      rules,
      updateChatWithHistoryCheck,
      scrollToBottom,
      reasoningEffort,
      isProjectMode,
      activeProject,
      webSearchEnabled,
      piiCheckEnabled,
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

  // Edit a message and re-submit - truncates conversation after the edited message
  const editMessage = useCallback(
    (messageIndex: number, newContent: string) => {
      if (loadingState !== 'idle' || !currentChat) return

      const originalMessage = currentChat.messages[messageIndex]
      if (!originalMessage || originalMessage.role !== 'user') return

      // Truncate messages to just before the edited message
      const truncatedMessages = currentChat.messages.slice(0, messageIndex)

      // Re-submit with the new content, passing truncated messages as base
      // handleQuery will handle state updates and persistence
      handleQuery(
        newContent,
        originalMessage.documentContent,
        originalMessage.multimodalText,
        originalMessage.documents,
        originalMessage.imageData,
        undefined,
        truncatedMessages,
      )
    },
    [loadingState, currentChat, handleQuery],
  )

  // Regenerate a message - same as edit but uses the original content
  const regenerateMessage = useCallback(
    (messageIndex: number) => {
      if (loadingState !== 'idle' || !currentChat) return

      const originalMessage = currentChat.messages[messageIndex]
      if (!originalMessage || originalMessage.role !== 'user') return

      // Re-submit with the same content
      editMessage(messageIndex, originalMessage.content || '')
    },
    [loadingState, currentChat, editMessage],
  )

  // Update currentChatIdRef when currentChat changes
  // But don't overwrite during streaming to preserve ID swaps
  useEffect(() => {
    if (!isStreamingRef.current) {
      currentChatIdRef.current = currentChat?.id || ''
    }
  }, [currentChat])

  return {
    input,
    loadingState,
    retryInfo,
    inputRef,
    isThinking,
    isWaitingForResponse,
    isStreaming,
    setInput,
    handleSubmit,
    handleQuery,
    cancelGeneration,
    editMessage,
    regenerateMessage,
  }
}
