import { AI_MODELS } from '@/app/config/models'
import { API_BASE_URL } from '@/config'
import { useCallback, useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { generateTitle } from '../../utils/title'
import { scrollToBottom } from './chat-messages'
import { ChatError } from './chat-utils'
import { CONSTANTS } from './constants'
import type { AIModel, Chat, LabelType, LoadingState, Message } from './types'
import { useApiKey } from '@/hooks/use-api-key'
import { useAuth } from '@clerk/nextjs'

export function useChatState({
  systemPrompt,
  storeHistory = true,
  isPremium = true,
}: {
  systemPrompt: string
  storeHistory?: boolean
  isPremium?: boolean
}) {
  const { getToken } = useAuth()
  const { apiKey, getApiKey: getApiKeyFromHook } = useApiKey()
  const [chats, setChats] = useState<Chat[]>(() => {
    const defaultChat: Chat = {
      id: uuidv4(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
    }

    // Return default chat for server-side rendering
    if (typeof window === 'undefined') {
      return [defaultChat]
    }

    // Return default chat initially, then load from storage asynchronously
    return [defaultChat]
  })

  // Load chats from storage asynchronously
  useEffect(() => {
    if (storeHistory && typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('chats')
        if (saved) {
          const savedChats = JSON.parse(saved)
          if (savedChats.length > 0) {
            const parsedChats = savedChats.map((chat: Chat) => ({
              ...chat,
              createdAt: new Date(chat.createdAt),
            }))
            setChats(parsedChats)
            setCurrentChat(parsedChats[0])
          }
        }
        // Clear initial load state after loading chats
        setIsInitialLoad(false)
      } catch (error) {
        console.error('Error loading chats from localStorage:', error)
        setIsInitialLoad(false)
      }
    } else {
      // If not storing history, clear initial load immediately
      setIsInitialLoad(false)
    }
  }, [storeHistory])

  // Initialize currentChat with the first chat
  const [currentChat, setCurrentChat] = useState<Chat>(chats[0])
  const [input, setInput] = useState('')
  const [loadingState, setLoadingState] = useState<LoadingState>('idle')
  const [abortController, setAbortController] =
    useState<AbortController | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const currentChatIdRef = useRef<string>(currentChat.id)
  const [isClient, setIsClient] = useState(false)
  const isStreamingRef = useRef(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [isThinking, setIsThinking] = useState(false)
  const [verificationComplete, setVerificationComplete] = useState(false)
  const [verificationSuccess, setVerificationSuccess] = useState(false)
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false)
  const hasCreatedInitialChatRef = useRef(false)
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 0,
  )

  // Add state for expanded label
  const [expandedLabel, setExpandedLabel] = useState<LabelType>(null)

  // Model state
  const [selectedModel, setSelectedModel] = useState<AIModel>(() => {
    // Client-side initialization for premium users
    if (typeof window !== 'undefined') {
      const savedModel = sessionStorage.getItem(
        'selectedModel',
      ) as AIModel | null
      // Verify the saved model is valid
      if (savedModel && Object.keys(AI_MODELS).includes(savedModel)) {
        return savedModel
      }
    }
    return CONSTANTS.DEFAULT_MODEL
  })

  // Override model selection for free users
  const effectiveModel = !storeHistory
    ? CONSTANTS.DEFAULT_FREE_MODEL
    : selectedModel

  // A modified version of updateChat that respects the storeHistory flag
  const updateChatWithHistoryCheck = (
    _chats: Chat[], // unused now – kept to avoid changing call-sites
    setChats: React.Dispatch<React.SetStateAction<Chat[]>>,
    currentChat: Chat,
    setCurrentChat: React.Dispatch<React.SetStateAction<Chat>>,
    chatId: string,
    newMessages: Message[],
    immediate = false,
    isThinking = false,
  ) => {
    setChats((prevChats) => {
      // Find the latest version of this chat (to preserve any recent title changes)
      const existingChat = prevChats.find((c) => c.id === chatId) || currentChat

      const updatedChat: Chat = {
        ...existingChat,
        messages: newMessages,
      }

      // Build new array
      const newChats = prevChats.map((c) => (c.id === chatId ? updatedChat : c))

      // Persist if needed
      if (storeHistory && (!isThinking || immediate)) {
        localStorage.setItem('chats', JSON.stringify(newChats))
      }

      // Also replace currentChat state
      setCurrentChat(updatedChat)

      return newChats
    })
  }

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
          localStorage.setItem('chats', JSON.stringify(newChats))
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
    await new Promise((resolve) => setTimeout(resolve, 50))
  }, [abortController, storeHistory])

  // Handle chat query
  async function handleQuery(query: string, documentContent?: string, documents?: Array<{ name: string }>) {
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
      timestamp: new Date(),
    }

    // Generate title immediately if this is the first message
    let updatedChat = { ...currentChat };
    
    if (currentChat.messages.length === 0 && storeHistory) {
      const title = generateTitle(query);
      // Make sure title is not empty
      const safeTitle = title.trim() || 'Chat about ' + query.slice(0, 20) + '...';
      
      // Update the current chat with the new title
      updatedChat = { ...currentChat, title: safeTitle };
      setCurrentChat(updatedChat);
      
      // Update all chats in state and localStorage
      const updatedChatsWithTitle = chats.map(chat => 
        chat.id === currentChat.id ? { ...chat, title: safeTitle } : chat
      );
      
      setChats(updatedChatsWithTitle);
      if (storeHistory) {
        localStorage.setItem('chats', JSON.stringify(updatedChatsWithTitle));
      }
    }

    const updatedMessages = [...currentChat.messages, userMessage];
    updatedChat = { ...updatedChat, messages: updatedMessages };
    
    // Update the current chat with the new messages
    setCurrentChat(updatedChat);
    
    // Update chats array with both title and messages
    setChats(prevChats => {
      const newChats = prevChats.map(chat => 
        chat.id === currentChat.id ? updatedChat : chat
      );
      
      if (storeHistory) {
        localStorage.setItem('chats', JSON.stringify(newChats));
      }
      
      return newChats;
    });
    
    setInput('');

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
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

      const model = AI_MODELS(isPremium).find(
        (model) => model.modelName === effectiveModel,
      )
      if (!model) {
        throw new Error(`Model ${effectiveModel} not found`)
      }

      const chatEndpoint = 'endpoint' in model
        ? (model.endpoint as string)
        : `https://${model.enclave}/v1/chat/completions`;
      
    
      const response = await fetch(
        chatEndpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await getApiKey()}`,
          },
          body: JSON.stringify({
            model: model.modelName,
            messages: [
              // System prompt is always included even when messages are cut off
              {
                role: 'system',
                content: systemPrompt.replace('<MODEL_NAME>', model.name),
              },
              // Include message history with a limit
              ...updatedMessages.slice(-10).map((msg) => ({
                role: msg.role,
                content: msg.documentContent
                  ? `${msg.content}\n\nDocument contents:\n${msg.documentContent}`
                  : msg.content,
              })),
            ],
            stream: true,
          }),
          signal: controller.signal,
        },
      )

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
                chats,
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
                chats,
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
                initialContentBuffer.length > 5  // Reduced from 20 to 5 for better responsiveness
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
                  chats,
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
                const currentChatWithTitle = chats.find(c => c.id === currentChat.id) || currentChat;
                
                updateChatWithHistoryCheck(
                  chats,
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
                const currentChatWithTitle = chats.find(c => c.id === currentChat.id) || currentChat;
                
                updateChatWithHistoryCheck(
                  chats,
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
            console.error('Error parsing SSE line:', error, line)
            continue
          }
        }
      }
    } catch (error) {
      setIsWaitingForResponse(false) // Make sure to clear waiting state on error
      // Only log and show error message if it's not an abort error
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error('Chat error:', error)

        const errorMessage: Message = {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date(),
          isError: true,
        }

        // Get the current chat with its potentially updated title
        const currentChatWithTitle = chats.find(c => c.id === currentChat.id) || currentChat;
        
        updateChatWithHistoryCheck(
          chats,
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
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    handleQuery(input)
  }

  // Create a new chat
  const createNewChat = useCallback(() => {
    if (!storeHistory) return // Prevent creating new chats for basic users

    const newChat: Chat = {
      id: uuidv4(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
    }
    setCurrentChat(newChat)
    
    // Update chats array by adding the new chat at the beginning
    setChats((prev) => {
      const updatedChats = [newChat, ...prev];
      // Save to localStorage explicitly
      if (storeHistory) {
        localStorage.setItem('chats', JSON.stringify(updatedChats));
      }
      return updatedChats;
    });
  }, [storeHistory])

  // Delete a chat
  const deleteChat = useCallback(
    (chatId: string) => {
      if (!storeHistory) return // Prevent deleting chats for basic users

      setChats((prevChats) => {
        const newChats = prevChats.filter((chat) => chat.id !== chatId)
        if (currentChat?.id === chatId) {
          // Switch to first remaining chat or create new one if none left
          if (newChats.length === 0) {
            const newChat: Chat = {
              id: uuidv4(),
              title: 'New Chat',
              messages: [],
              createdAt: new Date(),
            }
            setCurrentChat(newChat)
            return [newChat]
          }
          setCurrentChat(newChats[0])
        }
        localStorage.setItem('chats', JSON.stringify(newChats))
        return newChats
      })
    },
    [currentChat?.id, storeHistory],
  )

  // Switch to a different chat
  const switchChat = useCallback(
    async (chat: Chat) => {
      if (!storeHistory) return // Prevent switching chats for basic users

      if (loadingState !== 'idle') {
        await cancelGeneration()
      }
      setCurrentChat(chat)
      setIsInitialLoad(true)

      // Set isInitialLoad back to false after a brief delay to show the chat
      setTimeout(() => {
        setIsInitialLoad(false)
      }, 300)
    },
    [loadingState, cancelGeneration, storeHistory],
  )

  // Handle chat selection
  const handleChatSelect = useCallback(
    (chatId: string) => {
      if (!storeHistory) return // Prevent chat selection for basic users

      const selectedChat = chats.find((chat) => chat.id === chatId) || chats[0]
      switchChat(selectedChat)

      // Close sidebar after selecting a chat on all devices
      setIsSidebarOpen(false)
    },
    [chats, switchChat, storeHistory],
  )

  // Update currentChatIdRef when currentChat changes
  useEffect(() => {
    currentChatIdRef.current = currentChat.id
  }, [currentChat])

  // Toggle dark mode
  const toggleTheme = useCallback(() => {
    setIsDarkMode((prev) => {
      const newTheme = !prev
      localStorage.setItem('theme', newTheme ? 'dark' : 'light')
      return newTheme
    })
  }, [])

  // Use the abstracted API key hook
  const getApiKey = getApiKeyFromHook;

  // Handle verifier expansion
  const openAndExpandVerifier = useCallback(() => {
    // Always ensure the sidebar is open
    setIsSidebarOpen(true)

    // Add a delay to ensure sidebar is opened before expanding verifier
    setTimeout(() => {
      const event = new CustomEvent('expand-verifier')
      window.dispatchEvent(event)
    }, 300)
  }, [])

  // Handle input focus
  const handleInputFocus = useCallback(() => {
    // Close sidebar on all devices when input is focused
    if (isSidebarOpen) {
      setIsSidebarOpen(false)
    }
  }, [isSidebarOpen])

  // Handle label click
  const handleLabelClick = useCallback(
    (label: 'verify' | 'model' | 'info', action: () => void) => {
      if (expandedLabel === label) {
        // If already expanded, perform the action
        action()
        setExpandedLabel(null)
      } else {
        // If not expanded or different label is expanded, expand this one
        setExpandedLabel(label)
      }
    },
    [expandedLabel],
  )

  // Handle model selection
  const handleModelSelect = useCallback(
    (model: AIModel) => {
      // Prevent free users from changing models
      if (!storeHistory) return

      setSelectedModel(model)
      setExpandedLabel(null)
      setVerificationComplete(false) // Reset verification state
      setVerificationSuccess(false) // Reset verification success state

      // Trigger re-verification in the sidebar by dispatching a custom event
      if (typeof window !== 'undefined') {
        const resetEvent = new CustomEvent('reset-verification')
        window.dispatchEvent(resetEvent)
      }

      // Save to session storage
      sessionStorage.setItem('selectedModel', model)
    },
    [storeHistory],
  )

  // Update chat title
  const updateChatTitle = useCallback(
    (chatId: string, newTitle: string) => {
      if (!storeHistory) return // Prevent updating titles for basic users

      setChats((prevChats) => {
        const updatedChats = prevChats.map((chat) =>
          chat.id === chatId ? { ...chat, title: newTitle } : chat,
        )
        localStorage.setItem('chats', JSON.stringify(updatedChats))
        return updatedChats
      })

      // Also update current chat if it's the one being edited
      if (currentChat?.id === chatId) {
        setCurrentChat((prev) => ({ ...prev, title: newTitle }))
      }
    },
    [storeHistory, currentChat?.id],
  )

  // Client-side initialization
  useEffect(() => {
    setIsClient(true)

    // Check localStorage first
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme !== null) {
      setIsDarkMode(savedTheme === 'dark')
      return
    }

    // Fall back to system preference
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)',
    ).matches
    setIsDarkMode(prefersDark)

    // Listen for system theme changes if no saved preference
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      setIsDarkMode(e.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // Add effect to handle window resizing
  useEffect(() => {
    if (isClient) {
      const handleResize = () => {
        setWindowWidth(window.innerWidth)
      }

      window.addEventListener('resize', handleResize)
      return () => {
        window.removeEventListener('resize', handleResize)
      }
    }
  }, [isClient])

  // Add effect to handle clicks outside the model selector
  useEffect(() => {
    if (expandedLabel === 'model') {
      const handleClickOutside = (event: MouseEvent) => {
        // Find the model selector element
        const modelSelectorButton = document.querySelector(
          '[data-model-selector]',
        )
        const modelSelectorMenu = document.querySelector('[data-model-menu]')

        // If we clicked outside both the button and the menu, close the menu
        if (
          modelSelectorButton &&
          modelSelectorMenu &&
          !modelSelectorButton.contains(event.target as Node) &&
          !modelSelectorMenu.contains(event.target as Node)
        ) {
          setExpandedLabel(null)
        }
      }

      // Add global event listener
      document.addEventListener('mousedown', handleClickOutside)

      // Cleanup function
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [expandedLabel])

  // Add effect to create a new chat on initial load
  useEffect(() => {
    if (isClient && !hasCreatedInitialChatRef.current) {
      hasCreatedInitialChatRef.current = true
      
      if (!storeHistory) {
        // For non-premium users, just clear the loading state
        setIsInitialLoad(false)
      } else if (chats.length === 0) {
        // Only create a new chat if there are no chats
        createNewChat()
      } else {
        // Just ensure loading state is cleared
        setIsInitialLoad(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient]) // Only depend on isClient

  // Add effect to prevent body and html scrolling
  useEffect(() => {
    if (isClient) {
      // Prevent scrolling on both body and html elements
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
      document.body.style.height = '100%'
      document.body.style.overflow = 'hidden'
      document.body.style.overscrollBehavior = 'none'

      // Also apply to the HTML element
      document.documentElement.style.overscrollBehavior = 'none'
      document.documentElement.style.overflow = 'hidden'
      document.documentElement.style.height = '100%'

      return () => {
        // Cleanup
        document.body.style.position = ''
        document.body.style.width = ''
        document.body.style.height = ''
        document.body.style.overflow = ''
        document.body.style.overscrollBehavior = ''

        document.documentElement.style.overscrollBehavior = ''
        document.documentElement.style.overflow = ''
        document.documentElement.style.height = ''
      }
    }
  }, [isClient])

  return {
    // State
    chats,
    currentChat,
    input,
    loadingState,
    inputRef,
    isClient,
    isSidebarOpen,
    isDarkMode,
    messagesEndRef,
    isInitialLoad,
    isThinking,
    verificationComplete,
    verificationSuccess,
    isWaitingForResponse,
    selectedModel,
    expandedLabel,
    windowWidth,
    apiKey,

    // Setters
    setInput,
    setIsSidebarOpen,
    setIsInitialLoad,
    setVerificationComplete,
    setVerificationSuccess,

    // Actions
    handleSubmit,
    handleQuery,
    createNewChat,
    deleteChat,
    handleChatSelect,
    toggleTheme,
    openAndExpandVerifier,
    handleInputFocus,
    handleLabelClick,
    handleModelSelect,
    cancelGeneration,
    updateChatTitle,
    getApiKey,
  }
}
