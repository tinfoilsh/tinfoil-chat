import type { BaseModel } from '@/app/config/models'
import { useEffect, useRef } from 'react'
import type { AIModel, Chat, LabelType, LoadingState } from '../types'
import { useChatMessaging } from './use-chat-messaging'
import { useChatStorage } from './use-chat-storage'
import { useModelManagement } from './use-model-management'
import { useUIState } from './use-ui-state'

// Return type for useChatState hook
interface UseChatStateReturn {
  // State
  chats: Chat[]
  currentChat: Chat
  input: string
  loadingState: LoadingState
  inputRef: React.RefObject<HTMLTextAreaElement>
  isClient: boolean
  isSidebarOpen: boolean
  isDarkMode: boolean
  messagesEndRef: React.RefObject<HTMLDivElement>
  isInitialLoad: boolean
  isThinking: boolean
  verificationComplete: boolean
  verificationSuccess: boolean
  isWaitingForResponse: boolean
  selectedModel: AIModel
  expandedLabel: LabelType
  windowWidth: number
  apiKey: string | null

  // Setters
  setInput: (input: string) => void
  setIsSidebarOpen: (isOpen: boolean) => void
  setIsInitialLoad: (isLoading: boolean) => void
  setVerificationComplete: (complete: boolean) => void
  setVerificationSuccess: (success: boolean) => void

  // Actions
  handleSubmit: (e: React.FormEvent) => void
  handleQuery: (
    query: string,
    documentContent?: string,
    documents?: Array<{ name: string }>,
  ) => void
  createNewChat: () => void
  deleteChat: (chatId: string) => void
  handleChatSelect: (chatId: string) => void
  toggleTheme: () => void
  openAndExpandVerifier: () => void
  handleInputFocus: () => void
  handleLabelClick: (
    label: 'verify' | 'model' | 'info',
    action: () => void,
  ) => void
  handleModelSelect: (modelName: AIModel) => void
  cancelGeneration: () => Promise<void>
  updateChatTitle: (chatId: string, newTitle: string) => void
  getApiKey: () => Promise<string>
}

export function useChatState({
  systemPrompt,
  storeHistory = true,
  isPremium = true,
  models = [],
  subscriptionLoading = false,
}: {
  systemPrompt: string
  storeHistory?: boolean
  isPremium?: boolean
  models?: BaseModel[]
  subscriptionLoading?: boolean
}): UseChatStateReturn {
  const hasCreatedInitialChatRef = useRef(false)

  // UI State Management
  const {
    isClient,
    isSidebarOpen,
    isDarkMode,
    windowWidth,
    messagesEndRef,
    setIsSidebarOpen,
    toggleTheme,
    openAndExpandVerifier,
    handleInputFocus,
  } = useUIState()

  // Chat Storage Management
  const {
    chats,
    currentChat,
    setChats,
    setCurrentChat,
    createNewChat,
    deleteChat,
    updateChatTitle,
    handleChatSelect,
    setIsInitialLoad,
    isInitialLoad,
  } = useChatStorage({ storeHistory, isClient })

  // Model Management
  const {
    selectedModel,
    expandedLabel,
    setExpandedLabel,
    setVerificationComplete,
    setVerificationSuccess,
    verificationComplete,
    verificationSuccess,
    handleModelSelect,
    handleLabelClick,
  } = useModelManagement({
    models,
    isPremium,
    isClient,
    storeHistory,
    subscriptionLoading,
  })

  // Chat Messaging
  const {
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
  } = useChatMessaging({
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
  })

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
  }, [expandedLabel, setExpandedLabel])

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
