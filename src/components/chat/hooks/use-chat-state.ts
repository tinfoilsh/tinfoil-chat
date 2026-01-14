import type { BaseModel } from '@/config/models'
import { useEffect, useRef } from 'react'
import type { AIModel, Chat, LabelType, LoadingState } from '../types'
import { useChatMessaging } from './use-chat-messaging'
import { useChatStorage } from './use-chat-storage'
import { useModelManagement } from './use-model-management'
import type { ReasoningEffort } from './use-reasoning-effort'
import { useUIState } from './use-ui-state'

// Return type for useChatState hook
interface UseChatStateReturn {
  // State
  chats: Chat[]
  currentChat: Chat
  input: string
  loadingState: LoadingState
  retryInfo: { attempt: number; maxRetries: number; error?: string } | null
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
  hasValidatedModel: boolean
  expandedLabel: LabelType
  windowWidth: number

  // Setters
  setInput: (input: string) => void
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>
  setIsInitialLoad: (isLoading: boolean) => void
  setVerificationComplete: (complete: boolean) => void
  setVerificationSuccess: (success: boolean) => void

  // Actions
  handleSubmit: (e: React.FormEvent) => void
  handleQuery: (
    query: string,
    documentContent?: string,
    documents?: Array<{ name: string }>,
    imageData?: Array<{ base64: string; mimeType: string }>,
    systemPromptOverride?: string,
  ) => void
  createNewChat: (isLocalOnly?: boolean, fromUserAction?: boolean) => void
  deleteChat: (chatId: string) => void
  handleChatSelect: (chatId: string) => void
  toggleTheme: () => void
  openAndExpandVerifier: () => void
  handleInputFocus: () => void
  handleLabelClick: (
    label: Exclude<LabelType, null>,
    action: () => void,
  ) => void
  handleModelSelect: (modelName: AIModel) => void
  cancelGeneration: () => Promise<void>
  updateChatTitle: (chatId: string, newTitle: string) => void
  reloadChats: () => Promise<void>
  editMessage: (messageIndex: number, newContent: string) => void
  regenerateMessage: (messageIndex: number) => void
}

export function useChatState({
  systemPrompt,
  rules = '',
  storeHistory = true,
  isPremium = true,
  models = [],
  subscriptionLoading = false,
  scrollToBottom,
  reasoningEffort,
  initialChatId,
}: {
  systemPrompt: string
  rules?: string
  storeHistory?: boolean
  isPremium?: boolean
  models?: BaseModel[]
  subscriptionLoading?: boolean
  scrollToBottom?: () => void
  reasoningEffort?: ReasoningEffort
  initialChatId?: string | null
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
    reloadChats,
  } = useChatStorage({
    storeHistory,
    scrollToBottom,
    beforeSwitchChat: async () => {
      // Cancel generation will be defined after useChatMessaging hook
      if (cancelGenerationRef.current) {
        await cancelGenerationRef.current()
      }
    },
    initialChatId,
  })

  // Create ref to store cancelGeneration function
  const cancelGenerationRef = useRef<(() => Promise<void>) | null>(null)

  // Model Management
  const {
    selectedModel,
    hasValidatedModel,
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
    retryInfo,
    inputRef,
    isThinking,
    isWaitingForResponse,
    setInput,
    handleSubmit,
    handleQuery,
    cancelGeneration,
    editMessage,
    regenerateMessage,
  } = useChatMessaging({
    systemPrompt,
    rules,
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
  })

  // Update ref with cancelGeneration function
  cancelGenerationRef.current = cancelGeneration

  // Add effect to handle clicks outside the model/reasoning selectors
  useEffect(() => {
    if (expandedLabel === 'model' || expandedLabel === 'reasoning') {
      const handleClickOutside = (event: MouseEvent) => {
        if (expandedLabel === 'model') {
          const modelSelectorButton = document.querySelector(
            '[data-model-selector]',
          )
          const modelSelectorMenu = document.querySelector('[data-model-menu]')

          if (
            modelSelectorButton &&
            modelSelectorMenu &&
            !modelSelectorButton.contains(event.target as Node) &&
            !modelSelectorMenu.contains(event.target as Node)
          ) {
            setExpandedLabel(null)
          }
        } else if (expandedLabel === 'reasoning') {
          const reasoningSelectorButton = document.querySelector(
            '[data-reasoning-selector]',
          )
          const reasoningSelectorMenu = document.querySelector(
            '[data-reasoning-menu]',
          )

          if (
            reasoningSelectorButton &&
            reasoningSelectorMenu &&
            !reasoningSelectorButton.contains(event.target as Node) &&
            !reasoningSelectorMenu.contains(event.target as Node)
          ) {
            setExpandedLabel(null)
          }
        }
      }

      document.addEventListener('mousedown', handleClickOutside)

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
    retryInfo,
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
    hasValidatedModel,
    expandedLabel,
    windowWidth,

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
    reloadChats,
    editMessage,
    regenerateMessage,
  }
}
