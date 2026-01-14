import {
  getAIModels,
  getSystemPromptAndRules,
  type BaseModel,
} from '@/config/models'
import { useChatRouter } from '@/hooks/use-chat-router'
import { useSubscriptionStatus } from '@/hooks/use-subscription-status'
import { useToast } from '@/hooks/use-toast'
import { SignInButton, useAuth, useUser } from '@clerk/nextjs'
import {
  ArrowDownIcon,
  Bars3Icon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  FolderIcon,
  PlusIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { PiSpinner } from 'react-icons/pi'

import {
  ProjectModeBanner,
  ProjectSidebar,
  useProject,
  useProjectSystemPrompt,
} from '@/components/project'
import { cn } from '@/components/ui/utils'
import { CLOUD_SYNC } from '@/config'
import { useCloudSync } from '@/hooks/use-cloud-sync'
import { useProfileSync } from '@/hooks/use-profile-sync'
import { encryptionService } from '@/services/encryption/encryption-service'
import { migrationEvents } from '@/services/storage/migration-events'
import {
  isCloudSyncEnabled,
  setCloudSyncEnabled,
} from '@/utils/cloud-sync-settings'
import { logError } from '@/utils/error-handling'
import {
  getProjectUploadPreference,
  setProjectUploadPreference,
} from '@/utils/project-upload-preference'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { UrlHashMessageHandler } from '../url-hash-message-handler'
import { ChatControls } from './chat-controls'
import { ChatInput } from './chat-input'
import { ChatMessages } from './chat-messages'
import { ChatSidebar } from './chat-sidebar'
import { CONSTANTS } from './constants'
import { useDocumentUploader } from './document-uploader'
import { useChatState } from './hooks/use-chat-state'
import { useCustomSystemPrompt } from './hooks/use-custom-system-prompt'
import { useReasoningEffort } from './hooks/use-reasoning-effort'
import { initializeRenderers } from './renderers/client'
import type { ProcessedDocument } from './renderers/types'
// Lazy-load modals that aren't shown on initial load
const CloudSyncIntroModal = dynamic(
  () =>
    import('../modals/cloud-sync-intro-modal').then(
      (m) => m.CloudSyncIntroModal,
    ),
  { ssr: false },
)
const EncryptionKeyModal = dynamic(
  () =>
    import('../modals/encryption-key-modal').then((m) => m.EncryptionKeyModal),
  { ssr: false },
)
const CloudSyncSetupModal = dynamic(
  () =>
    import('../modals/cloud-sync-setup-modal').then(
      (m) => m.CloudSyncSetupModal,
    ),
  { ssr: false },
)
const AddToProjectContextModal = dynamic(
  () =>
    import('../modals/add-to-project-context-modal').then(
      (m) => m.AddToProjectContextModal,
    ),
  { ssr: false },
)
// Lazy-load heavy, non-critical UI to reduce initial bundle and speed up FCP
const VerifierSidebarLazy = dynamic(
  () => import('../verification-sidebar').then((m) => m.VerifierSidebar),
  { ssr: false },
)
const SettingsSidebarLazy = dynamic(
  () => import('./settings-sidebar').then((m) => m.SettingsSidebar),
  { ssr: false },
)
const ShareModalLazy = dynamic(
  () => import('./share-modal').then((m) => m.ShareModal),
  { ssr: false },
)

type ChatInterfaceProps = {
  verificationState?: any
  showVerifyButton?: boolean
  minHeight?: string
  inputMinHeight?: string
  isDarkMode?: boolean
  initialChatId?: string | null
  initialProjectId?: string | null
}

// Helper to roughly estimate token count based on character length (≈4 chars per token)
const estimateTokenCount = (text: string | undefined): number => {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

// Helper to parse values like "64k tokens" → 64000
const parseContextWindowTokens = (contextWindow?: string): number => {
  if (!contextWindow) return 64000 // sensible default
  const match = contextWindow.match(/(\d+)(k)?/i)
  if (!match) return 64000
  let tokens = parseInt(match[1], 10)
  if (match[2]) {
    tokens *= 1000
  }
  return tokens
}

// Generate a silly privacy-themed project name
function generateProjectName(): string {
  const adjectives = [
    'Private',
    'Secret',
    'Encrypted',
    'Anonymous',
    'Stealth',
    'Incognito',
    'Covert',
    'Hidden',
    'Shadowy',
    'Mysterious',
    'Whispered',
    'Cloaked',
    'Veiled',
    'Masked',
    'Undercover',
  ]

  const animals = [
    'Orangutan',
    'Penguin',
    'Platypus',
    'Armadillo',
    'Chameleon',
    'Pangolin',
    'Narwhal',
    'Capybara',
    'Axolotl',
    'Quokka',
    'Wombat',
    'Hedgehog',
    'Otter',
    'Sloth',
    'Lemur',
  ]

  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)]
  const animal = animals[Math.floor(Math.random() * animals.length)]

  return `${adjective} ${animal}`
}

export function ChatInterface({
  verificationState,
  minHeight,
  inputMinHeight = '28px',
  isDarkMode: propIsDarkMode,
  initialChatId,
  initialProjectId,
}: ChatInterfaceProps) {
  const { toast } = useToast()
  const { isSignedIn } = useAuth()
  const { user } = useUser()
  const { chat_subscription_active, isLoading: subscriptionLoading } =
    useSubscriptionStatus()

  // Initialize cloud sync
  const {
    syncing,
    syncChats,
    smartSyncChats,
    syncProjectChats,
    encryptionKey,
    isFirstTimeUser,
    setEncryptionKey,
    retryDecryptionWithNewKey,
    clearFirstTimeUser,
    decryptionProgress,
  } = useCloudSync()

  // Initialize profile sync
  const {
    retryDecryption: retryProfileDecryption,
    syncFromCloud: syncProfileFromCloud,
    smartSyncFromCloud: smartSyncProfileFromCloud,
    syncToCloud: syncProfileToCloud,
  } = useProfileSync()

  // State for API data
  const [models, setModels] = useState<BaseModel[]>([])
  const [systemPrompt, setSystemPrompt] = useState<string>('')
  const [rules, setRules] = useState<string>('')
  const [isLoadingConfig, setIsLoadingConfig] = useState(true)

  // State for right sidebar
  const [isVerifierSidebarOpen, setIsVerifierSidebarOpen] = useState(false)

  // State for settings sidebar
  const [isSettingsSidebarOpen, setIsSettingsSidebarOpen] = useState(false)

  // State for share modal
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)

  // State for encryption key modal
  const [isEncryptionKeyModalOpen, setIsEncryptionKeyModalOpen] =
    useState(false)

  // State for cloud sync intro modal
  const [isCloudSyncIntroModalOpen, setIsCloudSyncIntroModalOpen] =
    useState(false)

  // State for cloud sync setup modal
  const [showCloudSyncSetupModal, setShowCloudSyncSetupModal] = useState(false)

  // State for add-to-project-context modal
  const [showAddToProjectModal, setShowAddToProjectModal] = useState(false)
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null)

  // State for tracking processed documents
  const [processedDocuments, setProcessedDocuments] = useState<
    ProcessedDocument[]
  >([])

  // State for tracking verification document
  const [verificationDocument, setVerificationDocument] = useState<any>(null)

  // Get the user's email
  const userEmail = user?.primaryEmailAddress?.emailAddress || ''

  // Use subscription status from hook
  const isPremium = chat_subscription_active ?? false

  // Use reasoning effort hook for gpt-oss models
  const { reasoningEffort, setReasoningEffort } = useReasoningEffort()

  // Detect platform for keyboard shortcut display
  const isMac = useMemo(() => {
    if (typeof navigator === 'undefined') return true
    return /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  }, [])
  const modKey = isMac ? '⌘' : 'Ctrl+'
  const shiftKey = isMac ? '⇧' : 'Shift+'

  // Use custom system prompt hook
  const { effectiveSystemPrompt, processedRules } = useCustomSystemPrompt(
    systemPrompt,
    rules,
  )

  // Use project system prompt hook to inject project context
  const {
    isProjectMode,
    activeProject,
    enterProjectMode,
    exitProjectMode,
    createProject,
    loadingProject,
    uploadDocument: uploadProjectDocument,
    addUploadingFile,
    removeUploadingFile,
  } = useProject()
  const { effectiveSystemPrompt: finalSystemPrompt } = useProjectSystemPrompt({
    baseSystemPrompt: effectiveSystemPrompt,
    baseRules: processedRules,
  })

  // URL routing for deep links
  const { updateUrlForChat, clearUrl } = useChatRouter()

  // Initialize renderers on mount
  useEffect(() => {
    initializeRenderers()
  }, [])

  // Check for migration and show intro modal
  useEffect(() => {
    if (!isSignedIn || typeof window === 'undefined') return

    // Check if user has already seen the intro
    const hasSeenIntro = localStorage.getItem('hasSeenCloudSyncIntro')
    if (hasSeenIntro) return

    // Check if migration already happened (page refresh case)
    const hasMigrated = sessionStorage.getItem('pendingMigrationSync')
    if (hasMigrated === 'true') {
      setIsCloudSyncIntroModalOpen(true)
      localStorage.setItem('hasSeenCloudSyncIntro', 'true')
      return
    }

    // Listen for migration event
    const unsubscribe = migrationEvents.on('migration-completed', (event) => {
      // Only show modal if user hasn't seen it yet
      const hasSeenIntro = localStorage.getItem('hasSeenCloudSyncIntro')
      if (!hasSeenIntro && event.migratedCount > 0) {
        setIsCloudSyncIntroModalOpen(true)
        localStorage.setItem('hasSeenCloudSyncIntro', 'true')
      }
    })

    return unsubscribe
  }, [isSignedIn])

  // Load models and system prompt immediately in parallel
  // Use cached subscription status to load the right models from the start
  useEffect(() => {
    let cancelled = false
    const loadInitial = async () => {
      try {
        // Check if we have cached subscription status to use the right endpoint immediately
        const cachedStatus =
          typeof window !== 'undefined'
            ? localStorage.getItem('cached_subscription_status')
            : null
        const isPremiumCached = cachedStatus
          ? JSON.parse(cachedStatus).chat_subscription_active
          : false

        // Fetch everything in parallel with best guess for model endpoint
        const [promptData, models] = await Promise.all([
          getSystemPromptAndRules(),
          getAIModels(isPremiumCached), // Use cached status or default to free
        ])

        if (!cancelled) {
          setSystemPrompt(promptData.systemPrompt)
          setRules(promptData.rules)
          setModels(models)
          setIsLoadingConfig(false)
        }
      } catch (error) {
        logError('Failed to load chat configuration', error, {
          component: 'ChatInterface',
          action: 'loadConfig',
        })
        if (!cancelled) {
          setIsLoadingConfig(false)
        }
      }
    }

    loadInitial()
    return () => {
      cancelled = true
    }
  }, [])

  // Update models if subscription status changes from cached value
  useEffect(() => {
    if (subscriptionLoading || isLoadingConfig) return

    let cancelled = false
    const updateModelsIfNeeded = async () => {
      try {
        // Check if we need to reload models based on actual subscription status
        const cachedStatus =
          typeof window !== 'undefined'
            ? localStorage.getItem('cached_subscription_status')
            : null

        const isPremiumNow = chat_subscription_active ?? false

        // Reload models if:
        // 1. No cache exists (post-logout scenario)
        // 2. Cached status differs from actual status
        if (!cachedStatus) {
          // No cache means user just logged in/out - always reload to ensure correct models
          const updatedModels = await getAIModels(isPremiumNow)
          if (!cancelled) {
            setModels(updatedModels)
          }
        } else {
          // Cache exists - only reload if status changed
          const wasPremiumCached =
            JSON.parse(cachedStatus).chat_subscription_active
          if (wasPremiumCached !== isPremiumNow) {
            const updatedModels = await getAIModels(isPremiumNow)
            if (!cancelled) {
              setModels(updatedModels)
            }
          }
        }
      } catch (error) {
        logError('Failed to update models', error, {
          component: 'ChatInterface',
          action: 'updateModels',
        })
      }
    }

    updateModelsIfNeeded()
    return () => {
      cancelled = true
    }
  }, [subscriptionLoading, chat_subscription_active, isLoadingConfig])

  // State for scroll button - define early so it can be used in useChatState
  const [showScrollButton, setShowScrollButton] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const scrollCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  // Function to scroll to bottom with optional smooth behavior
  const scrollToBottom = useCallback((smooth = true) => {
    if (scrollContainerRef.current) {
      const el = scrollContainerRef.current
      if (smooth) {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: 'smooth',
        })
      } else {
        el.scrollTop = el.scrollHeight
      }
    }
  }, [])

  // Scroll the last user message to the top of the viewport (with offset for header)
  const scrollUserMessageToTop = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    // Wait for DOM to render, then scroll
    setTimeout(() => {
      const userMessages = container.querySelectorAll(
        '[data-message-role="user"]',
      )
      const lastUserMessage = userMessages[
        userMessages.length - 1
      ] as HTMLElement | null

      if (lastUserMessage) {
        // Calculate scroll position with offset for header buttons
        // Mobile needs more offset due to overlapping header buttons
        const messageTop = lastUserMessage.offsetTop
        const isMobile = window.innerWidth < CONSTANTS.MOBILE_BREAKPOINT
        const headerOffset = isMobile ? 80 : 16
        container.scrollTo({
          top: messageTop - headerOffset,
          behavior: 'smooth',
        })
      }
    }, 100)
  }, [])

  // Scroll to the last message (for the scroll button)
  const scrollToLastMessage = useCallback(() => {
    scrollToBottom(true)
  }, [scrollToBottom])

  const {
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
  } = useChatState({
    systemPrompt: finalSystemPrompt,
    rules: processedRules,
    storeHistory: isSignedIn || !isCloudSyncEnabled(), // Enable storage for signed-in users OR local-only mode
    isPremium: isPremium,
    models: models,
    subscriptionLoading: subscriptionLoading,
    // Scroll user message to top of viewport when sending
    scrollToBottom: scrollUserMessageToTop,
    reasoningEffort,
    initialChatId,
  })

  // Sync URL with current chat state
  useEffect(() => {
    // Don't update URL during initial load or if chat is blank
    if (isInitialLoad) return
    if (currentChat.isBlankChat) {
      clearUrl()
      return
    }

    // Update URL based on whether we're in project mode
    if (isProjectMode && activeProject?.id) {
      updateUrlForChat(currentChat.id, activeProject.id)
    } else if (currentChat.projectId) {
      // Chat belongs to a project but we're not in project mode yet
      // Use the chat's projectId for the URL
      updateUrlForChat(currentChat.id, currentChat.projectId)
    } else {
      // Regular chat, no project
      updateUrlForChat(currentChat.id)
    }
  }, [
    currentChat.id,
    currentChat.isBlankChat,
    currentChat.projectId,
    isProjectMode,
    activeProject?.id,
    isInitialLoad,
    updateUrlForChat,
    clearUrl,
  ])

  // Initialize tinfoil client once when page loads
  useEffect(() => {
    const initTinfoil = async () => {
      try {
        const { initializeTinfoilClient, getTinfoilClient } = await import(
          '@/services/inference/tinfoil-client'
        )
        // Initialize in background - will use placeholder key if not signed in
        await initializeTinfoilClient()

        // Fetch the verification document after initialization
        const client = await getTinfoilClient()
        const doc = await (client as any).getVerificationDocument?.()
        if (doc) {
          setVerificationDocument(doc)
          // Set verification status based on document
          if (doc.securityVerified !== undefined) {
            setVerificationComplete(true)
            setVerificationSuccess(doc.securityVerified)
          }
        }
      } catch (error) {
        logError('Failed to initialize tinfoil client', error, {
          component: 'ChatInterface',
          action: 'initTinfoil',
        })
      }
    }
    initTinfoil()
  }, [setVerificationComplete, setVerificationSuccess])

  // Effect to handle window resize and enforce single sidebar rule
  useEffect(() => {
    // When window becomes narrow and both types of sidebars are open, close the right one
    if (windowWidth < CONSTANTS.SINGLE_SIDEBAR_BREAKPOINT) {
      if (isSidebarOpen && (isVerifierSidebarOpen || isSettingsSidebarOpen)) {
        // Close right sidebars to prioritize left sidebar
        setIsVerifierSidebarOpen(false)
        setIsSettingsSidebarOpen(false)
      }
    }
  }, [windowWidth, isSidebarOpen, isVerifierSidebarOpen, isSettingsSidebarOpen])

  // Auto-focus input when component mounts and is ready (no autoscroll)
  useEffect(() => {
    if (isClient && !isLoadingConfig && !subscriptionLoading && currentChat) {
      // Small delay to ensure DOM is ready and input is rendered
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [isClient, isLoadingConfig, subscriptionLoading, currentChat, inputRef])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+. (or Ctrl+.) to toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault()
        setIsSidebarOpen((prev) => !prev)
        return
      }

      // Shift+Cmd+O (or Shift+Ctrl+O) for new chat
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === 'o'
      ) {
        e.preventDefault()
        if (currentChat?.messages?.length !== 0) {
          createNewChat()
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setIsSidebarOpen, currentChat?.messages?.length, createNewChat])

  // Get the selected model details
  const selectedModelDetails = models.find(
    (model) => model.modelName === selectedModel,
  ) as BaseModel | undefined

  // Initialize document uploader hook
  const { handleDocumentUpload } = useDocumentUploader(
    isPremium,
    selectedModelDetails,
  )

  // Sync chats when user signs in and periodically
  // Profile sync is handled separately by useProfileSync hook
  // Context-aware: syncs personal chats when not in project mode, project chats when in project mode
  useEffect(() => {
    if (!isSignedIn) return

    // Initial sync based on current mode
    const initialSync =
      isProjectMode && activeProject
        ? () => syncProjectChats(activeProject.id)
        : () => syncChats()

    initialSync()
      .then(() => reloadChats())
      .catch((error) => {
        logError('Failed to sync chats on page load', error, {
          component: 'ChatInterface',
          action: 'initialSync',
          metadata: { isProjectMode, projectId: activeProject?.id },
        })
      })

    // Use smart sync at regular intervals - checks sync status first to reduce bandwidth
    // Syncs project chats when in project mode, personal chats otherwise
    const interval = setInterval(() => {
      const projectId =
        isProjectMode && activeProject ? activeProject.id : undefined
      smartSyncChats(projectId)
        .then((result) => {
          // Only reload chats if something was actually synced
          if (result.uploaded > 0 || result.downloaded > 0) {
            return reloadChats()
          }
        })
        .catch((error) => {
          logError('Failed to sync chats (periodic)', error, {
            component: 'ChatInterface',
            action: 'periodicSync',
            metadata: { isProjectMode, projectId: activeProject?.id },
          })
        })
    }, CLOUD_SYNC.CHAT_SYNC_INTERVAL)

    return () => clearInterval(interval)
  }, [
    isSignedIn,
    isProjectMode,
    activeProject,
    syncChats,
    smartSyncChats,
    syncProjectChats,
    reloadChats,
  ])

  // Handler for opening verifier sidebar
  const handleOpenVerifierSidebar = () => {
    if (isVerifierSidebarOpen) {
      // If already open, close it
      handleSetVerifierSidebarOpen(false)
    } else {
      // Open verifier and close settings if open
      handleSetVerifierSidebarOpen(true)
      setIsSettingsSidebarOpen(false)
    }
  }

  // Handler for setting verifier sidebar state
  const handleSetVerifierSidebarOpen = (isOpen: boolean) => {
    setIsVerifierSidebarOpen(isOpen)
    if (isOpen) {
      // If window is narrow, close left sidebar when opening right sidebar
      if (windowWidth < CONSTANTS.SINGLE_SIDEBAR_BREAKPOINT) {
        setIsSidebarOpen(false)
      }
    }
  }

  // Handler for settings sidebar
  const handleOpenSettingsSidebar = () => {
    if (isSettingsSidebarOpen) {
      // If already open, close it
      setIsSettingsSidebarOpen(false)
    } else {
      // Open settings and close verifier if open
      setIsSettingsSidebarOpen(true)
      handleSetVerifierSidebarOpen(false)
      // If window is narrow, close left sidebar when opening settings
      if (windowWidth < CONSTANTS.SINGLE_SIDEBAR_BREAKPOINT) {
        setIsSidebarOpen(false)
      }
    }
  }

  // Handler for opening share modal
  const handleOpenShareModal = () => {
    setIsShareModalOpen(true)
  }

  // Handler for encryption key button
  const handleOpenEncryptionKeyModal = () => {
    setIsEncryptionKeyModalOpen(true)
  }

  // Handler for cloud sync setup
  const handleOpenCloudSyncSetup = () => {
    setShowCloudSyncSetupModal(true)
  }

  // Handler for creating a new project with a random name
  const handleCreateProject = useCallback(async () => {
    try {
      const name = generateProjectName()
      const project = await createProject({ name, description: '' })
      await enterProjectMode(project.id)
    } catch (error) {
      logError('Failed to create project', error, {
        component: 'ChatInterface',
        action: 'handleCreateProject',
      })
      toast({
        title: 'Failed to create project',
        description: 'Please try again.',
        variant: 'destructive',
      })
    }
  }, [createProject, enterProjectMode, toast])

  // Handler for exiting project mode - creates a new chat and exits
  const handleExitProject = useCallback(() => {
    createNewChat(false, true)
    exitProjectMode()
  }, [createNewChat, exitProjectMode])

  // Don't automatically create new chats - let the chat state handle initialization
  // This effect has been removed to prevent unnecessary chat creation

  // Modified openAndExpandVerifier to use the right sidebar
  const modifiedOpenAndExpandVerifier = () => {
    // Always open the verifier sidebar when called
    const newState = !isVerifierSidebarOpen
    handleSetVerifierSidebarOpen(newState)
    // Close settings sidebar when opening verifier
    if (newState) {
      setIsSettingsSidebarOpen(false)
    }
  }

  // Helper to process file and add to chat attachments
  const processFileForChat = useCallback(
    async (file: File) => {
      const tempDocId = Math.random().toString(36).substring(2, 9)

      setProcessedDocuments((prev) => [
        ...prev,
        {
          id: tempDocId,
          name: file.name,
          time: new Date(),
          isUploading: true,
        },
      ])

      await handleDocumentUpload(
        file,
        (content, documentId, imageData) => {
          const newDocTokens = estimateTokenCount(content)
          const contextLimit = parseContextWindowTokens(
            selectedModelDetails?.contextWindow,
          )

          const existingTokens = processedDocuments.reduce(
            (total, doc) => total + estimateTokenCount(doc.content),
            0,
          )

          if (existingTokens + newDocTokens > contextLimit) {
            setProcessedDocuments((prev) =>
              prev.filter((doc) => doc.id !== tempDocId),
            )

            toast({
              title: 'Context window saturated',
              description:
                "The selected model's context window is full. Remove a document or choose a model with a larger context window before uploading more files.",
              variant: 'destructive',
              position: 'top-left',
            })
            return
          }

          setProcessedDocuments((prev) => {
            return prev.map((doc) =>
              doc.id === tempDocId
                ? {
                    id: documentId,
                    name: file.name,
                    time: new Date(),
                    content,
                    imageData,
                  }
                : doc,
            )
          })
        },
        (error) => {
          setProcessedDocuments((prev) =>
            prev.filter((doc) => doc.id !== tempDocId),
          )

          toast({
            title: 'Processing failed',
            description: error.message || 'Failed to process document',
            variant: 'destructive',
            position: 'top-left',
          })
        },
      )
    },
    [
      handleDocumentUpload,
      processedDocuments,
      selectedModelDetails?.contextWindow,
      toast,
    ],
  )

  // Helper to process file and add to project context
  const addFileToProjectContext = useCallback(
    async (file: File) => {
      const uploadId = crypto.randomUUID()

      // Add to shared uploading state so sidebar shows progress
      addUploadingFile({
        id: uploadId,
        name: file.name,
        size: file.size,
      })

      // Open sidebar and expand documents section immediately
      sessionStorage.setItem('expandProjectDocuments', 'true')
      setIsSidebarOpen(true)

      await handleDocumentUpload(
        file,
        async (content) => {
          try {
            await uploadProjectDocument(file, content)
          } catch {
            toast({
              title: 'Upload failed',
              description: 'Failed to add document to project context.',
              variant: 'destructive',
              position: 'top-left',
            })
          } finally {
            removeUploadingFile(uploadId)
          }
        },
        (error) => {
          toast({
            title: 'Processing failed',
            description: error.message || 'Failed to process document',
            variant: 'destructive',
            position: 'top-left',
          })
          removeUploadingFile(uploadId)
        },
      )
    },
    [
      handleDocumentUpload,
      uploadProjectDocument,
      toast,
      setIsSidebarOpen,
      addUploadingFile,
      removeUploadingFile,
    ],
  )

  // Handler for modal confirmation
  const handleAddToProjectConfirm = useCallback(
    async (addToProject: boolean, rememberChoice: boolean) => {
      if (rememberChoice) {
        setProjectUploadPreference(addToProject ? 'project' : 'chat')
      }

      // Capture file and close modal immediately
      const fileToUpload = pendingUploadFile
      setPendingUploadFile(null)
      setShowAddToProjectModal(false)

      // Then process upload (UI will show upload progress)
      if (fileToUpload) {
        if (addToProject) {
          await addFileToProjectContext(fileToUpload)
        } else {
          await processFileForChat(fileToUpload)
        }
      }
    },
    [pendingUploadFile, addFileToProjectContext, processFileForChat],
  )

  // Document upload handler wrapper
  const handleFileUpload = useCallback(
    async (file: File) => {
      // Check if in project mode
      if (isProjectMode && activeProject) {
        const preference = getProjectUploadPreference()

        if (preference === 'project') {
          await addFileToProjectContext(file)
          return
        } else if (preference === 'chat') {
          await processFileForChat(file)
          return
        } else {
          // No preference saved - show dialog
          setPendingUploadFile(file)
          setShowAddToProjectModal(true)
          return
        }
      }

      // Not in project mode - use normal chat flow
      await processFileForChat(file)
    },
    [isProjectMode, activeProject, addFileToProjectContext, processFileForChat],
  )

  // Handler for removing documents
  const removeDocument = (id: string) => {
    setProcessedDocuments((prev) => prev.filter((doc) => doc.id !== id))
  }

  // Calculate context usage percentage (memoized to prevent re-calculation during streaming)
  const contextUsagePercentage = useMemo(() => {
    // Calculate context usage
    const contextLimit = parseContextWindowTokens(
      selectedModelDetails?.contextWindow,
    )

    let totalTokens = 0

    // Count tokens from messages
    if (currentChat?.messages) {
      currentChat.messages.forEach((msg) => {
        totalTokens += estimateTokenCount(msg.content)
        if (msg.thoughts) {
          totalTokens += estimateTokenCount(msg.thoughts)
        }
      })
    }

    // Count tokens from documents
    if (processedDocuments) {
      processedDocuments.forEach((doc) => {
        totalTokens += estimateTokenCount(doc.content)
      })
    }

    return (totalTokens / contextLimit) * 100
  }, [
    currentChat?.messages,
    processedDocuments,
    selectedModelDetails?.contextWindow,
  ])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Filter out documents that are still uploading
    const completedDocuments = processedDocuments.filter(
      (doc) => !doc.isUploading,
    )

    // Use default message if no input but documents are attached
    const messageText =
      input.trim() ||
      (completedDocuments.length > 0 ? CONSTANTS.DOCUMENT_ONLY_MESSAGE : '')

    // Don't proceed if there's no input text and no documents
    if (!messageText) {
      return
    }

    // Don't auto-scroll here - let the message append handler do it
    // This prevents the dip when thoughts start streaming

    // If we have completed documents, create a message with their content
    const docContent =
      completedDocuments.length > 0
        ? completedDocuments
            .map(
              (doc) =>
                `Document title: ${doc.name}\nDocument contents:\n${doc.content}`,
            )
            .filter((content) => content)
            .join('\n\n')
        : undefined

    const documentNames =
      completedDocuments.length > 0
        ? completedDocuments.map((doc) => ({ name: doc.name }))
        : undefined

    // Collect image data from documents for multimodal support
    const imageData =
      completedDocuments.length > 0
        ? completedDocuments
            .map((doc) => doc.imageData)
            .filter(
              (imgData): imgData is { base64: string; mimeType: string } =>
                imgData !== undefined,
            )
        : undefined

    // Call handleQuery with the message, document content, document names, and image data
    handleQuery(messageText, docContent, documentNames, imageData)

    // Only remove the completed documents from the state
    const remainingDocuments = processedDocuments.filter(
      (doc) => doc.isUploading,
    )
    setProcessedDocuments(remainingDocuments)
  }

  // --- Drag & Drop across bottom input area ---
  const [isBottomDragActive, setIsBottomDragActive] = useState(false)

  const handleBottomDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsBottomDragActive(true)
  }, [])

  const handleBottomDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsBottomDragActive(false)
  }, [])

  // Check if scroll button should be shown (throttled for performance)
  const checkScrollPosition = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return

    // Check if spacer is present and get its height
    const spacer = el.querySelector('[data-spacer]') as HTMLElement | null
    const spacerHeight = spacer?.offsetHeight || 0

    // Show button when user has scrolled up from the bottom by more than threshold
    // Subtract spacer height since it's empty space, not content
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight - spacerHeight
    const SCROLL_THRESHOLD = 200

    setShowScrollButton(distanceFromBottom > SCROLL_THRESHOLD)
  }, [])

  // Throttled scroll handler
  const lastScrollCheckRef = useRef<number>(0)
  const handleScroll = useCallback(() => {
    const now = Date.now()
    const timeSinceLastCheck = now - lastScrollCheckRef.current

    // Check immediately if enough time has passed since last check
    if (timeSinceLastCheck >= 100) {
      checkScrollPosition()
      lastScrollCheckRef.current = now
    } else {
      // Otherwise schedule a check after the remaining throttle time
      if (scrollCheckTimeoutRef.current) {
        clearTimeout(scrollCheckTimeoutRef.current)
      }
      scrollCheckTimeoutRef.current = setTimeout(() => {
        checkScrollPosition()
        lastScrollCheckRef.current = Date.now()
      }, 100 - timeSinceLastCheck)
    }
  }, [checkScrollPosition])

  // Check scroll position when content or layout changes
  useEffect(() => {
    checkScrollPosition()
    // Scroll to bottom when switching to a chat with messages
    if (currentChat?.messages && currentChat.messages.length > 0) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        scrollToBottom(false)
      }, 50)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkScrollPosition, currentChat?.id, scrollToBottom])

  // Re-check button visibility when content size changes (no scrolling)
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return

    let rafId: number | null = null
    const observer = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        checkScrollPosition()
        rafId = null
      })
    })

    const content = container.firstElementChild
    if (content) observer.observe(content)

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [checkScrollPosition])

  // Re-check on window resize
  useEffect(() => {
    const onResize = () => checkScrollPosition()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [checkScrollPosition])

  // Re-check when messages/streaming state updates (no scrolling)
  useEffect(() => {
    checkScrollPosition()
  }, [
    checkScrollPosition,
    currentChat?.messages,
    isWaitingForResponse,
    loadingState,
  ])

  // Nudge scroll slightly when content starts after thinking, only if near bottom
  const contentStartSnapshotRef = useRef<{
    key: string
    contentLen: number
    wasThinking: boolean
  } | null>(null)
  const scrolledForContentStartKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const el = scrollContainerRef.current
    const messages = currentChat?.messages
    if (!el || !messages || messages.length === 0) return

    const last = messages[messages.length - 1]
    if (last.role !== 'assistant') {
      contentStartSnapshotRef.current = null
      return
    }

    const key = `${
      last.timestamp instanceof Date
        ? last.timestamp.getTime()
        : String(last.timestamp || '')
    }`

    const prev = contentStartSnapshotRef.current
    const prevSame = prev && prev.key === key
    const prevContentLen = prevSame ? prev.contentLen : 0
    const nowContentLen = (last.content || '').length
    const nowThinkingish = Boolean(
      last.isThinking ||
        ((last.thoughts || '').length > 0 && nowContentLen === 0),
    )

    const contentStartedNow =
      prevSame && prevContentLen === 0 && nowContentLen > 0
    const wasThinkingBefore = Boolean(prev?.wasThinking)

    if (
      contentStartedNow &&
      wasThinkingBefore &&
      scrolledForContentStartKeyRef.current !== key
    ) {
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight
      const ANCHOR_THRESHOLD = 140
      const isNearBottom = distanceFromBottom <= ANCHOR_THRESHOLD
      if (isNearBottom) {
        scrolledForContentStartKeyRef.current = key
        el.scrollTo({ top: el.scrollTop + 120, behavior: 'smooth' })
      }
    }

    // Update snapshot
    contentStartSnapshotRef.current = {
      key,
      contentLen: nowContentLen,
      wasThinking: nowThinkingish || Boolean(prev?.wasThinking),
    }
  }, [currentChat?.messages])

  // Removed all automatic scroll behaviors during streaming. Scrolling now only occurs
  // via the explicit button or when a chat is loaded/switched.

  // Show sign-in required message when accessing a chat URL while not signed in
  if ((initialChatId || initialProjectId) && !isSignedIn) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-surface-chat-background px-4 font-aeonik">
        <div className="max-w-md text-center">
          <div className="mb-6 flex justify-center">
            <div className="rounded-full bg-surface-chat p-4">
              <svg
                className="h-8 w-8 text-content-secondary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                />
              </svg>
            </div>
          </div>
          <h2 className="mb-3 text-xl font-semibold text-content-primary">
            Sign in required
          </h2>
          <p className="mb-6 text-content-secondary">
            You need to sign in to access this chat.
          </p>
          <SignInButton mode="modal">
            <button className="rounded-lg bg-brand-accent-dark px-6 py-2.5 text-white transition-colors hover:bg-brand-accent-dark/90">
              Sign in
            </button>
          </SignInButton>
        </div>
      </div>
    )
  }

  // Show loading state while critical config is loading. Do not block on subscription.
  if (isLoadingConfig) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-chat-background">
        <PiSpinner className="h-10 w-10 animate-spin text-content-secondary" />
      </div>
    )
  }

  // Show error state if no models are available (configuration error)
  if (!isLoadingConfig && models.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-chat-background px-4 font-aeonik">
        <div className="max-w-md text-center">
          <div className="mb-6 text-7xl">:(</div>
          <h2 className="mb-3 text-xl font-semibold text-content-primary">
            Something went wrong
          </h2>
          <p className="mb-6 text-content-secondary">
            Tinfoil Chat is experiencing some technical difficulties. We&apos;re
            working on resolving it. Please try again later.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-brand-accent-dark px-6 py-2.5 text-white transition-colors hover:bg-brand-accent-dark/90"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex overflow-hidden bg-surface-chat-background"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        height: '100%',
        minHeight: '-webkit-fill-available',
        overscrollBehavior: 'none',
      }}
    >
      {/* URL Hash Message Handler */}
      <UrlHashMessageHandler
        isReady={
          !isLoadingConfig && isClient && !!currentChat && hasValidatedModel
        }
        onMessageReady={(message) => {
          handleQuery(message)
        }}
      />

      {/* Sidebar toggle buttons - visible when left sidebar is closed, hidden when open */}
      {!isSidebarOpen &&
        !(
          windowWidth < CONSTANTS.MOBILE_BREAKPOINT &&
          (isVerifierSidebarOpen || isSettingsSidebarOpen)
        ) &&
        (isSignedIn && isPremium ? (
          <div className="fixed left-4 top-4 z-50 flex flex-row gap-2 md:flex-col">
            {/* New chat button - first on desktop, last on mobile */}
            <div className="group relative order-last md:order-first">
              <button
                className={cn(
                  'flex items-center justify-center gap-2 rounded-lg border border-border-subtle p-2.5 transition-all duration-200',
                  'bg-surface-chat-background text-content-secondary',
                  currentChat?.messages?.length === 0
                    ? 'cursor-not-allowed text-content-muted opacity-50'
                    : 'hover:bg-surface-chat hover:text-content-primary',
                )}
                onClick={() => createNewChat()}
                aria-label="Create new chat"
                disabled={currentChat?.messages?.length === 0}
              >
                <PlusIcon className="h-5 w-5" />
              </button>
              <span
                className={cn(
                  'pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded border border-border-subtle px-2 py-1 text-xs opacity-0 transition-opacity',
                  currentChat?.messages?.length === 0
                    ? 'opacity-0'
                    : 'group-hover:opacity-100',
                  'bg-surface-chat-background text-content-primary shadow-sm',
                )}
              >
                New chat{' '}
                <span className="ml-1.5 text-content-muted">
                  {shiftKey}
                  {modKey}O
                </span>
              </span>
            </div>
            {/* Chats button */}
            <div className="group relative">
              <button
                className="flex items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-chat-background p-2.5 text-content-secondary transition-all duration-200 hover:bg-surface-chat hover:text-content-primary"
                onClick={() => {
                  sessionStorage.setItem('sidebarExpandSection', 'chats')
                  if (isProjectMode) {
                    handleExitProject()
                  }
                  setIsSidebarOpen(true)
                  if (windowWidth < CONSTANTS.SINGLE_SIDEBAR_BREAKPOINT) {
                    setIsVerifierSidebarOpen(false)
                    setIsSettingsSidebarOpen(false)
                  }
                }}
              >
                <ChatBubbleLeftRightIcon className="h-5 w-5" />
              </button>
              <span className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded border border-border-subtle bg-surface-chat-background px-2 py-1 text-xs text-content-primary opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                Chats{' '}
                <span className="ml-1.5 text-content-muted">{modKey}.</span>
              </span>
            </div>
            {/* Projects button */}
            <div className="group relative">
              <button
                className="flex items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-chat-background p-2.5 text-content-secondary transition-all duration-200 hover:bg-surface-chat hover:text-content-primary"
                onClick={() => {
                  sessionStorage.setItem('sidebarExpandSection', 'projects')
                  setIsSidebarOpen(true)
                  if (windowWidth < CONSTANTS.SINGLE_SIDEBAR_BREAKPOINT) {
                    setIsVerifierSidebarOpen(false)
                    setIsSettingsSidebarOpen(false)
                  }
                }}
              >
                <FolderIcon className="h-5 w-5" />
              </button>
              <span className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded border border-border-subtle bg-surface-chat-background px-2 py-1 text-xs text-content-primary opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                Projects
              </span>
            </div>
          </div>
        ) : (
          <div className="group relative">
            <button
              className="fixed left-4 top-4 z-50 flex items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-chat-background p-2.5 text-content-secondary transition-all duration-200 hover:bg-surface-chat hover:text-content-primary"
              onClick={() => {
                setIsSidebarOpen(true)
                if (windowWidth < CONSTANTS.SINGLE_SIDEBAR_BREAKPOINT) {
                  setIsVerifierSidebarOpen(false)
                  setIsSettingsSidebarOpen(false)
                }
              }}
              aria-label="Open sidebar"
            >
              <Bars3Icon className="h-5 w-5" />
            </button>
            <span className="pointer-events-none fixed left-4 top-16 z-50 whitespace-nowrap rounded border border-border-subtle bg-surface-chat-background px-2 py-1 text-xs text-content-primary opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
              Open sidebar{' '}
              <span className="ml-1.5 text-content-muted">{modKey}.</span>
            </span>
          </div>
        ))}

      {/* Right side toggle buttons */}
      {!(
        windowWidth < CONSTANTS.MOBILE_BREAKPOINT &&
        (isSidebarOpen || isVerifierSidebarOpen || isSettingsSidebarOpen)
      ) && (
        <div
          className="fixed top-4 z-50 flex gap-2 transition-all duration-300"
          style={{
            right:
              windowWidth >= CONSTANTS.MOBILE_BREAKPOINT
                ? isVerifierSidebarOpen
                  ? `${CONSTANTS.VERIFIER_SIDEBAR_WIDTH_PX + 24}px`
                  : isSettingsSidebarOpen
                    ? `${CONSTANTS.SETTINGS_SIDEBAR_WIDTH_PX + 24}px`
                    : '16px'
                : '16px',
          }}
        >
          {/* Settings toggle button */}
          <div className="group relative">
            <button
              id="settings-button"
              className={cn(
                'flex items-center justify-center gap-2 rounded-lg border border-border-subtle p-2.5 transition-all duration-200',
                'bg-surface-chat-background text-content-secondary hover:bg-surface-chat hover:text-content-primary',
                isSettingsSidebarOpen &&
                  'cursor-default bg-surface-chat text-content-muted hover:text-content-muted',
              )}
              onClick={handleOpenSettingsSidebar}
              aria-label={
                isSettingsSidebarOpen ? 'Close settings' : 'Open settings'
              }
              aria-pressed={isSettingsSidebarOpen}
            >
              <Cog6ToothIcon className="h-5 w-5" />
            </button>
            <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-border-subtle bg-surface-chat-background px-2 py-1 text-xs text-content-primary opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
              {isSettingsSidebarOpen ? 'Close settings' : 'Settings'}
            </span>
          </div>

          {/* Verifier toggle button */}
          <div className="group relative">
            <button
              className={cn(
                'flex items-center justify-center gap-2 rounded-lg border border-border-subtle p-2.5 transition-all duration-200',
                'bg-surface-chat-background text-content-secondary hover:bg-surface-chat hover:text-content-primary',
                isVerifierSidebarOpen &&
                  'cursor-default bg-surface-chat text-content-muted hover:text-content-muted',
              )}
              onClick={handleOpenVerifierSidebar}
              aria-label={
                isVerifierSidebarOpen
                  ? 'Close verification panel'
                  : 'Open verification panel'
              }
              aria-pressed={isVerifierSidebarOpen}
            >
              <ShieldCheckIcon className="h-5 w-5" />
            </button>
            <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-border-subtle bg-surface-chat-background px-2 py-1 text-xs text-content-primary opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
              {isVerifierSidebarOpen ? 'Close verification' : 'Verification'}
            </span>
          </div>
        </div>
      )}

      {/* Left Sidebar Component - Show ProjectSidebar when in project mode or loading */}
      {isProjectMode && activeProject ? (
        <ProjectSidebar
          isOpen={isSidebarOpen}
          setIsOpen={setIsSidebarOpen}
          project={activeProject}
          isDarkMode={isDarkMode}
          onExitProject={handleExitProject}
          onNewChat={() => createNewChat(false, true)}
          onSelectChat={handleChatSelect}
          currentChatId={currentChat?.id}
          isClient={isClient}
          isPremium={isPremium}
          chats={chats
            .filter((c) => c.projectId === activeProject.id)
            .map((c) => ({
              id: c.id,
              title: c.title,
              messageCount: c.messages.length,
              createdAt: c.createdAt,
              projectId: c.projectId,
              isBlankChat: c.isBlankChat,
            }))}
          deleteChat={deleteChat}
          updateChatTitle={updateChatTitle}
          onEncryptionKeyClick={
            isSignedIn ? handleOpenEncryptionKeyModal : undefined
          }
        />
      ) : loadingProject ? (
        <ProjectSidebar
          isOpen={isSidebarOpen}
          setIsOpen={setIsSidebarOpen}
          project={null}
          projectName={loadingProject.name}
          isLoading={true}
          isDarkMode={isDarkMode}
          onExitProject={handleExitProject}
          onNewChat={() => {}}
          onSelectChat={() => {}}
          isClient={isClient}
          isPremium={isPremium}
        />
      ) : (
        <ChatSidebar
          isOpen={isSidebarOpen}
          setIsOpen={setIsSidebarOpen}
          chats={chats}
          currentChat={currentChat}
          isDarkMode={isDarkMode}
          createNewChat={createNewChat}
          handleChatSelect={handleChatSelect}
          updateChatTitle={updateChatTitle}
          deleteChat={deleteChat}
          isClient={isClient}
          verificationComplete={verificationComplete}
          verificationSuccess={verificationSuccess}
          onVerificationComplete={(success) => {
            setVerificationComplete(true)
            setVerificationSuccess(success)
          }}
          isPremium={isPremium}
          onEncryptionKeyClick={
            isSignedIn ? handleOpenEncryptionKeyModal : undefined
          }
          onCloudSyncSetupClick={
            isSignedIn ? handleOpenCloudSyncSetup : undefined
          }
          onChatsUpdated={reloadChats}
          isProjectMode={isProjectMode}
          activeProjectName={activeProject?.name}
          onEnterProject={async (projectId, projectName) => {
            // Create a new blank chat before entering project mode
            // This prevents the current chat from being associated with the project
            createNewChat(false, true)
            await enterProjectMode(projectId, projectName)
          }}
          onCreateProject={handleCreateProject}
        />
      )}

      {/* Right Verifier Sidebar */}
      <VerifierSidebarLazy
        isOpen={isVerifierSidebarOpen}
        setIsOpen={handleSetVerifierSidebarOpen}
        verificationComplete={verificationComplete}
        verificationSuccess={verificationSuccess}
        onVerificationComplete={(success) => {
          setVerificationComplete(true)
          setVerificationSuccess(success)
        }}
        onVerificationUpdate={setVerificationDocument}
        isDarkMode={isDarkMode}
        isClient={isClient}
      />

      {/* Share Modal */}
      <ShareModalLazy
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        messages={currentChat?.messages || []}
        isDarkMode={isDarkMode}
        isSidebarOpen={
          isSidebarOpen && windowWidth >= CONSTANTS.MOBILE_BREAKPOINT
        }
        isRightSidebarOpen={
          (isVerifierSidebarOpen || isSettingsSidebarOpen) &&
          windowWidth >= CONSTANTS.MOBILE_BREAKPOINT
        }
      />

      {/* Settings Sidebar */}
      <SettingsSidebarLazy
        isOpen={isSettingsSidebarOpen}
        setIsOpen={setIsSettingsSidebarOpen}
        isDarkMode={isDarkMode}
        toggleTheme={toggleTheme}
        isClient={isClient}
        defaultSystemPrompt={systemPrompt}
        onEncryptionKeyClick={
          isSignedIn ? handleOpenEncryptionKeyModal : undefined
        }
        onCloudSyncSetupClick={
          isSignedIn ? handleOpenCloudSyncSetup : undefined
        }
        onChatsUpdated={reloadChats}
        isSignedIn={isSignedIn}
        isPremium={isPremium}
      />

      {/* Main Chat Area - Modified for sliding effect */}
      <div
        className="fixed inset-0 overflow-hidden transition-all duration-200"
        style={{
          right:
            windowWidth >= CONSTANTS.MOBILE_BREAKPOINT
              ? isVerifierSidebarOpen
                ? `${CONSTANTS.VERIFIER_SIDEBAR_WIDTH_PX}px`
                : isSettingsSidebarOpen
                  ? `${CONSTANTS.SETTINGS_SIDEBAR_WIDTH_PX}px`
                  : '0'
              : '0',
          bottom: 0,
          left:
            isSidebarOpen && windowWidth >= CONSTANTS.MOBILE_BREAKPOINT
              ? `${CONSTANTS.CHAT_SIDEBAR_WIDTH_PX}px`
              : '0',
          top: 0,
        }}
      >
        <div className="relative flex h-full flex-col bg-surface-chat-background">
          {/* Project Mode Banner */}
          {isProjectMode && activeProject && (
            <ProjectModeBanner
              projectName={activeProject.name}
              isDarkMode={isDarkMode}
            />
          )}

          {/* Decryption Progress Banner */}
          {decryptionProgress && decryptionProgress.isDecrypting && (
            <div className="border-b border-border-subtle bg-surface-chat px-4 py-2 text-content-secondary">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PiSpinner className="h-4 w-4 animate-spin text-content-secondary" />
                  <span className="text-sm">
                    Decrypting chats with new key...
                  </span>
                </div>
                {decryptionProgress.total > 0 && (
                  <span className="text-sm">
                    {decryptionProgress.current} / {decryptionProgress.total}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Messages Area */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            data-scroll-container="main"
            className="relative flex flex-1 overflow-y-auto bg-surface-chat-background"
          >
            <div className="flex min-w-0 flex-1">
              <ChatMessages
                messages={currentChat?.messages || []}
                isDarkMode={isDarkMode}
                chatId={currentChat.id}
                openAndExpandVerifier={modifiedOpenAndExpandVerifier}
                setIsSidebarOpen={setIsSidebarOpen}
                isWaitingForResponse={isWaitingForResponse}
                isPremium={isPremium}
                models={models}
                subscriptionLoading={subscriptionLoading}
                verificationState={verificationDocument}
                onSubmit={handleSubmit}
                input={input}
                setInput={setInput}
                loadingState={loadingState}
                retryInfo={retryInfo}
                cancelGeneration={cancelGeneration}
                inputRef={inputRef}
                handleInputFocus={handleInputFocus}
                handleDocumentUpload={handleFileUpload}
                processedDocuments={processedDocuments}
                removeDocument={removeDocument}
                selectedModel={selectedModel}
                handleModelSelect={handleModelSelect}
                expandedLabel={expandedLabel}
                handleLabelClick={handleLabelClick}
                onEditMessage={editMessage}
                onRegenerateMessage={regenerateMessage}
                showScrollButton={showScrollButton}
              />
            </div>
          </div>

          {/* Input Form - Show on mobile always, on desktop only when there are messages */}
          {isClient &&
            (windowWidth < CONSTANTS.MOBILE_BREAKPOINT ||
              (currentChat?.messages && currentChat.messages.length > 0)) && (
              <div
                className="relative flex-shrink-0 bg-surface-chat-background p-4"
                style={{
                  minHeight: '80px',
                  maxHeight: '50vh',
                  paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)',
                  transition: 'border 0.2s ease-in-out',
                  borderTop: isBottomDragActive
                    ? '2px solid rgba(52, 211, 153, 0.5)' // emerald-400 with 50% opacity
                    : 'none',
                  borderLeft: isBottomDragActive
                    ? '2px solid rgba(52, 211, 153, 0.5)'
                    : 'none',
                  borderRight: isBottomDragActive
                    ? '2px solid rgba(52, 211, 153, 0.5)'
                    : 'none',
                  borderBottom: isBottomDragActive
                    ? '2px solid rgba(52, 211, 153, 0.5)'
                    : 'none',
                }}
                onDragOver={handleBottomDragOver}
                onDragLeave={handleBottomDragLeave}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsBottomDragActive(false)
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleFileUpload(e.dataTransfer.files[0])
                  }
                }}
              >
                <form
                  onSubmit={handleSubmit}
                  className="mx-auto max-w-3xl px-3 md:px-8"
                >
                  {/* Labels - Model selection only for premium users */}
                  <ChatControls
                    verificationComplete={verificationComplete}
                    verificationSuccess={verificationSuccess}
                    openAndExpandVerifier={modifiedOpenAndExpandVerifier}
                    setIsSidebarOpen={setIsSidebarOpen}
                    expandedLabel={expandedLabel}
                    handleLabelClick={handleLabelClick}
                    selectedModel={selectedModel}
                    handleModelSelect={handleModelSelect}
                    isDarkMode={isDarkMode}
                    isPremium={isPremium}
                    models={models}
                    onShareClick={handleOpenShareModal}
                    hasMessages={
                      currentChat?.messages && currentChat.messages.length > 0
                    }
                    isCompactMode={
                      windowWidth < CONSTANTS.MOBILE_BREAKPOINT ||
                      (isSidebarOpen &&
                        (isVerifierSidebarOpen || isSettingsSidebarOpen))
                    }
                    contextUsagePercentage={contextUsagePercentage}
                    reasoningEffort={reasoningEffort}
                    onReasoningEffortChange={setReasoningEffort}
                  />

                  {/* Input */}
                  <ChatInput
                    input={input}
                    setInput={setInput}
                    handleSubmit={handleSubmit}
                    loadingState={loadingState}
                    cancelGeneration={cancelGeneration}
                    inputRef={inputRef}
                    handleInputFocus={handleInputFocus}
                    inputMinHeight={inputMinHeight}
                    isDarkMode={isDarkMode}
                    handleDocumentUpload={handleFileUpload}
                    processedDocuments={processedDocuments}
                    removeDocument={removeDocument}
                    isPremium={isPremium}
                    hasMessages={
                      currentChat?.messages && currentChat.messages.length > 0
                    }
                    audioModel={
                      models.find((m) => m.type === 'audio')?.modelName
                    }
                  />
                </form>

                {/* Scroll to bottom button - absolutely positioned in parent */}
                {showScrollButton && currentChat?.messages?.length > 0 && (
                  <div className="absolute -top-[50px] left-1/2 z-10 -translate-x-1/2">
                    <button
                      onClick={() => scrollToLastMessage()}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle bg-surface-sidebar-button shadow-md transition-colors hover:bg-surface-sidebar-button-hover"
                      aria-label="Scroll to bottom"
                    >
                      <ArrowDownIcon
                        className="h-4 w-4 text-content-secondary"
                        strokeWidth={2}
                      />
                    </button>
                  </div>
                )}
              </div>
            )}
        </div>
      </div>

      {/* Encryption Key Modal */}
      <EncryptionKeyModal
        isOpen={isEncryptionKeyModalOpen}
        onClose={() => setIsEncryptionKeyModalOpen(false)}
        encryptionKey={encryptionKey}
        onKeyChange={async (key: string) => {
          const syncResult = await setEncryptionKey(key)
          // If sync happened (key changed), reload chats
          if (syncResult) {
            await reloadChats()
            // Also retry profile decryption with the new key
            await retryProfileDecryption()
            // Notify projects to retry decryption
            window.dispatchEvent(new CustomEvent('encryptionKeyChanged'))
          }
        }}
        isDarkMode={isDarkMode}
      />

      {/* Cloud Sync Intro Modal */}
      <CloudSyncIntroModal
        isOpen={isCloudSyncIntroModalOpen}
        onClose={() => setIsCloudSyncIntroModalOpen(false)}
        isDarkMode={isDarkMode}
      />

      {/* Cloud Sync Setup Modal - manually triggered from settings */}
      {showCloudSyncSetupModal && (
        <CloudSyncSetupModal
          isOpen={showCloudSyncSetupModal}
          onClose={() => {
            setShowCloudSyncSetupModal(false)
            // If no key was set, turn off cloud sync
            if (!encryptionService.getKey()) {
              setCloudSyncEnabled(false)
            }
          }}
          onSetupComplete={async (key: string) => {
            const syncResult = await setEncryptionKey(key)
            if (syncResult) {
              await retryProfileDecryption()
              await reloadChats()
              // Notify projects to retry decryption
              window.dispatchEvent(new CustomEvent('encryptionKeyChanged'))
            }
            setShowCloudSyncSetupModal(false)
          }}
          isDarkMode={isDarkMode}
          initialCloudSyncEnabled={true}
        />
      )}

      {/* Add to Project Context Modal */}
      <AddToProjectContextModal
        isOpen={showAddToProjectModal}
        onClose={() => {
          setPendingUploadFile(null)
          setShowAddToProjectModal(false)
        }}
        onConfirm={handleAddToProjectConfirm}
        fileName={pendingUploadFile?.name ?? ''}
        projectName={activeProject?.name ?? ''}
        isDarkMode={isDarkMode}
      />
    </div>
  )
}

// Default export as well
export default ChatInterface
