import { TextureGrid } from '@/components/texture-grid'
import { cn } from '@/components/ui/utils'
import { API_BASE_URL } from '@/config'
import { authTokenManager } from '@/services/auth'
import { encryptionService } from '@/services/encryption/encryption-service'
import { chatStorage } from '@/services/storage/chat-storage'
import {
  isCloudSyncEnabled,
  setCloudSyncEnabled,
} from '@/utils/cloud-sync-settings'
import { logInfo } from '@/utils/error-handling'
import { SignInButton, UserButton, useUser } from '@clerk/nextjs'
import {
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  KeyIcon,
  MoonIcon,
  SunIcon,
  UserCircleIcon,
  UserIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { PiSignIn } from 'react-icons/pi'
import { CONSTANTS } from './constants'

type SettingsSidebarProps = {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  isDarkMode: boolean
  toggleTheme: () => void
  isClient: boolean
  defaultSystemPrompt?: string
  onEncryptionKeyClick?: () => void
  onCloudSyncSetupClick?: () => void
  onChatsUpdated?: () => void
  isSignedIn?: boolean
  isPremium?: boolean
}

export function SettingsSidebar({
  isOpen,
  setIsOpen,
  isDarkMode,
  toggleTheme,
  isClient,
  defaultSystemPrompt = '',
  onEncryptionKeyClick,
  onCloudSyncSetupClick,
  onChatsUpdated,
  isSignedIn,
  isPremium,
}: SettingsSidebarProps) {
  const { user } = useUser()
  const [maxMessages, setMaxMessages] = useState<number>(
    CONSTANTS.MAX_PROMPT_MESSAGES,
  )

  // Structured personalization fields
  const [nickname, setNickname] = useState<string>('')
  const [profession, setProfession] = useState<string>('')
  const [selectedTraits, setSelectedTraits] = useState<string[]>([])
  const [additionalContext, setAdditionalContext] = useState<string>('')
  const [isUsingPersonalization, setIsUsingPersonalization] =
    useState<boolean>(true)

  // Language setting (separate from personalization)
  const [language, setLanguage] = useState<string>('')

  // Custom system prompt settings
  const [isUsingCustomPrompt, setIsUsingCustomPrompt] = useState<boolean>(false)
  const [customSystemPrompt, setCustomSystemPrompt] = useState<string>('')

  // Cloud sync setting
  const [cloudSyncEnabled, setCloudSyncEnabledState] = useState<boolean>(false)

  // Web Search PII check setting (defaults to on)
  const [piiCheckEnabled, setPiiCheckEnabled] = useState<boolean>(true)

  // Active tab state
  const [activeTab, setActiveTab] = useState<
    'general' | 'chat' | 'personalization' | 'account'
  >('general')

  // Advanced settings collapsed state
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false)

  // Placeholder animation state
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [placeholderVisible, setPlaceholderVisible] = useState(true)

  // Upgrade state
  const [upgradeLoading, setUpgradeLoading] = useState(false)
  const [upgradeError, setUpgradeError] = useState<string | null>(null)

  // Available personality traits
  const availableTraits = [
    'witty',
    'encouraging',
    'formal',
    'casual',
    'analytical',
    'creative',
    'direct',
    'patient',
    'enthusiastic',
    'thoughtful',
    'forward thinking',
    'traditional',
    'skeptical',
    'optimistic',
  ]

  // Cycling profession placeholders
  const professionPlaceholders = [
    'Software engineer',
    'Designer',
    'Product manager',
    'Teacher',
    'Student',
    'Writer',
    'Entrepreneur',
    'Researcher',
    'Marketing specialist',
    'Data scientist',
  ]

  // Cycle through profession placeholders with fade animation
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderVisible(false)
      setTimeout(() => {
        setPlaceholderIndex(
          (prev) => (prev + 1) % professionPlaceholders.length,
        )
        setPlaceholderVisible(true)
      }, 150)
    }, 2000)
    return () => clearInterval(interval)
  }, [professionPlaceholders.length])

  const getCurrentPlaceholder = () => professionPlaceholders[placeholderIndex]

  // Available languages for dropdown
  const availableLanguages = [
    'English',
    'Spanish',
    'French',
    'German',
    'Italian',
    'Portuguese',
    'Russian',
    'Japanese',
    'Korean',
    'Chinese (Simplified)',
    'Chinese (Traditional)',
    'Arabic',
    'Hindi',
    'Dutch',
    'Swedish',
    'Norwegian',
    'Danish',
    'Finnish',
    'Polish',
    'Turkish',
  ]

  // Shared function to load settings from localStorage
  const loadSettingsFromStorage = useCallback(() => {
    // Load max messages setting
    const savedMaxMessages = localStorage.getItem('maxPromptMessages')
    if (savedMaxMessages) {
      const parsedValue = parseInt(savedMaxMessages, 10)
      if (
        !isNaN(parsedValue) &&
        parsedValue > 0 &&
        parsedValue <= CONSTANTS.MAX_PROMPT_MESSAGES_LIMIT
      ) {
        setMaxMessages(parsedValue)
      }
    }

    // Load personalization settings
    const savedNickname = localStorage.getItem('userNickname')
    const savedProfession = localStorage.getItem('userProfession')
    const savedTraits = localStorage.getItem('userTraits')
    const savedContext = localStorage.getItem('userAdditionalContext')
    const savedUsingPersonalization = localStorage.getItem(
      'isUsingPersonalization',
    )

    if (savedNickname !== null) setNickname(savedNickname)
    if (savedProfession !== null) setProfession(savedProfession)
    if (savedTraits) {
      try {
        setSelectedTraits(JSON.parse(savedTraits))
      } catch {
        setSelectedTraits([])
      }
    }
    if (savedContext !== null) setAdditionalContext(savedContext)
    if (savedUsingPersonalization !== null) {
      setIsUsingPersonalization(savedUsingPersonalization === 'true')
    }

    // Load language setting
    const savedLanguage = localStorage.getItem('userLanguage')
    if (savedLanguage) {
      setLanguage(savedLanguage)
    }

    // Load custom system prompt settings
    const savedUsingCustomPrompt = localStorage.getItem('isUsingCustomPrompt')
    const savedCustomPrompt = localStorage.getItem('customSystemPrompt')
    if (savedUsingCustomPrompt !== null) {
      setIsUsingCustomPrompt(savedUsingCustomPrompt === 'true')
    }
    if (savedCustomPrompt !== null) {
      setCustomSystemPrompt(savedCustomPrompt)
    } else if (defaultSystemPrompt) {
      setCustomSystemPrompt(defaultSystemPrompt)
    }

    // Load cloud sync setting
    setCloudSyncEnabledState(isCloudSyncEnabled())

    // Load PII check setting (defaults to true if not set)
    const savedPiiCheck = localStorage.getItem('piiCheckEnabled')
    setPiiCheckEnabled(savedPiiCheck === null ? true : savedPiiCheck === 'true')
  }, [defaultSystemPrompt])

  // Initial load settings from localStorage
  useEffect(() => {
    if (isClient) {
      loadSettingsFromStorage()

      // Set default language if not already set
      const savedLanguage = localStorage.getItem('userLanguage')
      if (!savedLanguage) {
        setLanguage('English')
        localStorage.setItem('userLanguage', 'English')
      }
    }
  }, [isClient, loadSettingsFromStorage])

  // Listen for profile sync updates
  useEffect(() => {
    if (!isClient) return

    // Listen for storage events (from other tabs or sync)
    window.addEventListener('storage', loadSettingsFromStorage)

    // Also listen for our custom events that fire after profile sync
    const handleProfileSyncUpdate = () => {
      loadSettingsFromStorage()
    }

    // Listen for cloud sync setting changes (e.g., from modal or other sources)
    const handleCloudSyncUpdate = () => {
      setCloudSyncEnabledState(isCloudSyncEnabled())
    }

    // These events are fired by the profile sync when it updates localStorage
    window.addEventListener('maxPromptMessagesChanged', handleProfileSyncUpdate)
    window.addEventListener('personalizationChanged', handleProfileSyncUpdate)
    window.addEventListener('languageChanged', handleProfileSyncUpdate)
    window.addEventListener(
      'customSystemPromptChanged',
      handleProfileSyncUpdate,
    )
    window.addEventListener('cloudSyncSettingChanged', handleCloudSyncUpdate)

    return () => {
      window.removeEventListener('storage', loadSettingsFromStorage)
      window.removeEventListener(
        'maxPromptMessagesChanged',
        handleProfileSyncUpdate,
      )
      window.removeEventListener(
        'personalizationChanged',
        handleProfileSyncUpdate,
      )
      window.removeEventListener('languageChanged', handleProfileSyncUpdate)
      window.removeEventListener(
        'customSystemPromptChanged',
        handleProfileSyncUpdate,
      )
      window.removeEventListener(
        'cloudSyncSettingChanged',
        handleCloudSyncUpdate,
      )
    }
  }, [isClient, loadSettingsFromStorage])

  // Save max messages setting to localStorage
  const handleMaxMessagesChange = (value: number) => {
    if (value > 0 && value <= CONSTANTS.MAX_PROMPT_MESSAGES_LIMIT) {
      setMaxMessages(value)
      if (isClient) {
        localStorage.setItem('maxPromptMessages', value.toString())
        // Trigger a custom event to notify other components
        window.dispatchEvent(
          new CustomEvent('maxPromptMessagesChanged', {
            detail: value,
          }),
        )
      }
    }
  }

  // Save personalization settings and notify components
  const savePersonalizationSettings = (values?: {
    nickname?: string
    profession?: string
    traits?: string[]
    additionalContext?: string
    isEnabled?: boolean
  }) => {
    if (isClient) {
      const currentNickname = values?.nickname ?? nickname
      const currentProfession = values?.profession ?? profession
      const currentTraits = values?.traits ?? selectedTraits
      const currentContext = values?.additionalContext ?? additionalContext
      const currentEnabled = values?.isEnabled ?? isUsingPersonalization

      localStorage.setItem('userNickname', currentNickname)
      localStorage.setItem('userProfession', currentProfession)
      localStorage.setItem('userTraits', JSON.stringify(currentTraits))
      localStorage.setItem('userAdditionalContext', currentContext)
      localStorage.setItem('isUsingPersonalization', currentEnabled.toString())

      // Trigger event to notify other components
      window.dispatchEvent(
        new CustomEvent('personalizationChanged', {
          detail: {
            nickname: currentNickname,
            profession: currentProfession,
            traits: currentTraits,
            additionalContext: currentContext,
            language,
            isEnabled: currentEnabled,
            defaultSystemPrompt,
          },
        }),
      )
    }
  }

  // Save language setting separately
  const saveLanguageSetting = (newLanguage: string) => {
    if (isClient) {
      localStorage.setItem('userLanguage', newLanguage)

      // Trigger event to notify other components about language change
      window.dispatchEvent(
        new CustomEvent('languageChanged', {
          detail: {
            language: newLanguage,
            defaultSystemPrompt,
          },
        }),
      )
    }
  }

  // Handle individual field changes
  const handleNicknameChange = (value: string) => {
    setNickname(value)
    if (isClient) {
      savePersonalizationSettings({ nickname: value })
    }
  }

  const handleProfessionChange = (value: string) => {
    setProfession(value)
    if (isClient) {
      savePersonalizationSettings({ profession: value })
    }
  }

  const handleTraitToggle = (trait: string) => {
    const newTraits = selectedTraits.includes(trait)
      ? selectedTraits.filter((t) => t !== trait)
      : [...selectedTraits, trait]
    setSelectedTraits(newTraits)
    if (isClient) {
      savePersonalizationSettings({ traits: newTraits })
    }
  }

  const handleContextChange = (value: string) => {
    setAdditionalContext(value)
    if (isClient) {
      savePersonalizationSettings({ additionalContext: value })
    }
  }

  const handleLanguageChange = (value: string) => {
    setLanguage(value)
    if (isClient) {
      saveLanguageSetting(value)
    }
  }

  const handleTogglePersonalization = (enabled: boolean) => {
    setIsUsingPersonalization(enabled)
    if (isClient) {
      savePersonalizationSettings({ isEnabled: enabled })
    }
  }

  const handleResetPersonalization = () => {
    setNickname('')
    setProfession('')
    setSelectedTraits([])
    setAdditionalContext('')
    setLanguage('English')

    if (isClient) {
      localStorage.removeItem('userNickname')
      localStorage.removeItem('userProfession')
      localStorage.removeItem('userTraits')
      localStorage.removeItem('userAdditionalContext')
      localStorage.setItem('userLanguage', 'English')
      saveLanguageSetting('English')
      savePersonalizationSettings({
        nickname: '',
        profession: '',
        traits: [],
        additionalContext: '',
        isEnabled: isUsingPersonalization,
      })
    }
  }

  const handleThemeToggle = () => {
    toggleTheme()
  }

  // Helper to strip <system> tags for display
  const stripSystemTags = (prompt: string): string => {
    return prompt
      .replace(/^<system>\s*\n?/, '')
      .replace(/\n?<\/system>\s*$/, '')
  }

  // Helper to add <system> tags if not present
  const ensureSystemTags = (prompt: string): string => {
    const trimmed = prompt.trim()
    if (!trimmed.startsWith('<system>')) {
      return `<system>\n${trimmed}\n</system>`
    }
    return trimmed
  }

  // Handle custom system prompt changes
  const handleToggleCustomPrompt = (enabled: boolean) => {
    setIsUsingCustomPrompt(enabled)
    if (isClient) {
      localStorage.setItem('isUsingCustomPrompt', enabled.toString())
      // Only dispatch event when toggling the feature
      const promptWithTags = ensureSystemTags(customSystemPrompt)
      window.dispatchEvent(
        new CustomEvent('customSystemPromptChanged', {
          detail: {
            isEnabled: enabled,
            customPrompt: promptWithTags,
          },
        }),
      )
    }
  }

  const handleCustomPromptChange = (value: string) => {
    setCustomSystemPrompt(value)
  }

  const handleCustomPromptBlur = () => {
    if (isClient) {
      // Store with system tags
      const promptWithTags = ensureSystemTags(customSystemPrompt)
      localStorage.setItem('customSystemPrompt', promptWithTags)
      // Only dispatch if currently enabled
      if (isUsingCustomPrompt) {
        window.dispatchEvent(
          new CustomEvent('customSystemPromptChanged', {
            detail: {
              isEnabled: true,
              customPrompt: promptWithTags,
            },
          }),
        )
      }
    }
  }

  // Restore default system prompt and persist immediately
  const handleRestoreDefaultPrompt = () => {
    const restoredWithoutTags = stripSystemTags(defaultSystemPrompt)
    setCustomSystemPrompt(restoredWithoutTags)
    if (isClient) {
      const promptWithTags = ensureSystemTags(restoredWithoutTags)
      localStorage.setItem('customSystemPrompt', promptWithTags)
      if (isUsingCustomPrompt) {
        window.dispatchEvent(
          new CustomEvent('customSystemPromptChanged', {
            detail: {
              isEnabled: true,
              customPrompt: promptWithTags,
            },
          }),
        )
      }
    }
  }

  const handleCloudSyncToggle = async (enabled: boolean) => {
    if (enabled) {
      // Check if encryption key exists
      if (!encryptionService.getKey()) {
        // Turn on the toggle visually (but don't persist yet)
        setCloudSyncEnabledState(true)

        // Show the cloud sync setup modal
        if (onCloudSyncSetupClick) {
          onCloudSyncSetupClick()
        }
        return
      }

      // If key exists, proceed with enabling
      setCloudSyncEnabledState(true)
      setCloudSyncEnabled(true)

      // Clear the explicit disable flag when re-enabling
      localStorage.removeItem('cloudSyncExplicitlyDisabled')
    } else {
      // Disabling cloud sync
      setCloudSyncEnabledState(false)
      setCloudSyncEnabled(false)

      // Mark that user explicitly disabled cloud sync (to prevent auto-enable)
      localStorage.setItem('cloudSyncExplicitlyDisabled', 'true')

      try {
        const deletedCount = await chatStorage.deleteAllNonLocalChats()
        logInfo(
          `Deleted ${deletedCount} synced chats when disabling cloud sync`,
          {
            component: 'SettingsSidebar',
            action: 'handleCloudSyncToggle',
          },
        )
        if (deletedCount > 0 && onChatsUpdated) {
          onChatsUpdated()
        }
      } catch (error) {
        logInfo('Failed to delete synced chats', {
          component: 'SettingsSidebar',
          action: 'handleCloudSyncToggle',
          metadata: { error },
        })
      }
    }

    if (isClient) {
      window.dispatchEvent(
        new CustomEvent('cloudSyncSettingChanged', {
          detail: { enabled },
        }),
      )
    }
  }

  const handleUpgradeToPro = useCallback(async () => {
    setUpgradeError(null)
    setUpgradeLoading(true)
    try {
      const token = await authTokenManager.getValidToken()

      const returnUrl = encodeURIComponent(window.location.origin)
      const response = await fetch(
        `${API_BASE_URL}/api/billing/chat-checkout-link?returnUrl=${returnUrl}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      )

      if (!response.ok) {
        throw new Error('Failed to generate checkout link')
      }

      const data = await response.json()
      if (!data?.url) {
        throw new Error('Checkout link unavailable')
      }

      window.location.href = data.url as string
    } catch {
      setUpgradeError('Failed to start checkout. Please try again later.')
    } finally {
      setUpgradeLoading(false)
    }
  }, [])

  // Billing state
  const [billingLoading, setBillingLoading] = useState(false)

  const handleManageBilling = useCallback(async () => {
    if (!getToken) return

    setBillingLoading(true)
    try {
      const token = await getToken()
      if (!token) throw new Error('No authentication token available')

      const response = await fetch(
        `${API_BASE_URL}/api/billing/subscriptions`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      )

      if (!response.ok) throw new Error('Failed to fetch subscriptions')

      const data = await response.json()
      const chatSubscription = data.subscriptions?.find(
        (sub: { product_name: string; manage_url: string }) =>
          sub.product_name?.toLowerCase().includes('chat'),
      )

      if (chatSubscription?.manage_url) {
        window.location.href = chatSubscription.manage_url
      } else {
        setUpgradeError('No active subscription found')
      }
    } catch {
      setUpgradeError('Failed to load billing. Please try again.')
    } finally {
      setBillingLoading(false)
    }
  }, [getToken])

  if (!isOpen) return null

  const navItems = [
    { id: 'general' as const, label: 'General', icon: Cog6ToothIcon },
    { id: 'chat' as const, label: 'Chat', icon: ChatBubbleLeftRightIcon },
    {
      id: 'personalization' as const,
      label: 'Personalization',
      icon: UserIcon,
    },
    { id: 'account' as const, label: 'Account', icon: UserCircleIcon },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Modal overlay */}
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => setIsOpen(false)}
      />

      {/* Settings modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{
          type: 'spring',
          damping: 25,
          stiffness: 300,
        }}
        className={cn(
          'relative z-10 flex h-[80vh] w-[90vw] max-w-4xl overflow-hidden rounded-xl border font-aeonik shadow-xl',
          'border-border-subtle bg-surface-sidebar text-content-primary',
        )}
      >
        {/* Left sidebar navigation */}
        <div className="flex w-56 flex-none flex-col border-r border-border-subtle">
          {/* Close button */}
          <div className="flex h-14 items-center px-4">
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1.5 text-content-secondary transition-colors hover:bg-surface-chat"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation items */}
          <nav className="flex-1 px-3 py-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  activeTab === item.id
                    ? 'bg-surface-chat text-content-primary'
                    : 'text-content-secondary hover:bg-surface-chat/50',
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Right content area */}
        <div className="flex flex-1 flex-col">
          {/* Header */}
          <div className="flex h-14 items-center border-b border-border-subtle px-6">
            <h2 className="font-aeonik text-lg font-semibold text-content-primary">
              {navItems.find((item) => item.id === activeTab)?.label}
            </h2>
          </div>

          {/* Content */}
          <div className="relative flex-1 overflow-y-auto p-6">
            <TextureGrid />
            <div className="relative z-10 space-y-6">
              {/* General Tab */}
              {activeTab === 'general' && (
                <>
                  {/* Appearance */}
                  <div className="space-y-3">
                    <h3 className="font-aeonik text-sm font-medium text-content-secondary">
                      Appearance
                    </h3>
                    <div
                      className={cn(
                        'flex items-center justify-between rounded-lg border border-border-subtle p-4',
                        isDarkMode ? 'bg-surface-sidebar' : 'bg-white',
                      )}
                    >
                      <div>
                        <div className="font-aeonik text-sm font-medium text-content-primary">
                          Theme
                        </div>
                        <div className="font-aeonik-fono text-xs text-content-muted">
                          Choose between light and dark mode
                        </div>
                      </div>
                      <button
                        id="theme-toggle"
                        onClick={handleThemeToggle}
                        className="rounded-lg border border-border-subtle bg-surface-chat p-2 text-content-secondary transition-all duration-200 hover:bg-surface-chat/80"
                      >
                        {isDarkMode ? (
                          <SunIcon className="h-5 w-5" />
                        ) : (
                          <MoonIcon className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Encrypted Cloud Sync */}
                  {onEncryptionKeyClick && (
                    <div className="space-y-3">
                      <h3 className="font-aeonik text-sm font-medium text-content-secondary">
                        Encrypted Cloud Sync
                      </h3>
                      <div
                        className={cn(
                          'rounded-lg border border-border-subtle p-4',
                          isDarkMode ? 'bg-surface-sidebar' : 'bg-white',
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-aeonik text-sm font-medium text-content-primary">
                              Cloud Sync
                            </div>
                            <div className="font-aeonik-fono text-xs text-content-muted">
                              {cloudSyncEnabled
                                ? 'End-to-end encrypted. Only you can access your chats and data.'
                                : 'Turn on Cloud Sync to back up and access your data across devices.'}
                            </div>
                          </div>
                          <label className="relative inline-flex cursor-pointer items-center">
                            <input
                              type="checkbox"
                              checked={cloudSyncEnabled}
                              onChange={(e) =>
                                handleCloudSyncToggle(e.target.checked)
                              }
                              className="peer sr-only"
                            />
                            <div className="peer h-5 w-9 rounded-full border border-border-subtle bg-content-muted/40 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-content-muted/70 after:shadow-sm after:transition-all after:content-[''] peer-checked:bg-brand-accent-light peer-checked:after:translate-x-full peer-checked:after:bg-white peer-focus:outline-none" />
                          </label>
                        </div>
                      </div>

                      {cloudSyncEnabled && (
                        <button
                          onClick={onEncryptionKeyClick}
                          className={cn(
                            'flex w-full items-start justify-between rounded-lg border border-border-subtle p-4 transition-colors hover:bg-surface-chat',
                            isDarkMode ? 'bg-surface-sidebar' : 'bg-white',
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <KeyIcon className="mt-0.5 h-5 w-5 text-content-muted" />
                            <div className="text-left">
                              <div className="font-aeonik text-sm font-medium text-content-primary">
                                Encryption Key
                              </div>
                              <div className="font-aeonik-fono text-xs text-content-muted">
                                Manage your chat encryption key
                              </div>
                            </div>
                          </div>
                          <div className="self-center text-sm text-content-muted">
                            →
                          </div>
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Chat Tab */}
              {activeTab === 'chat' && (
                <>
                  {/* Conversation Settings */}
                  <div className="space-y-3">
                    <h3 className="font-aeonik text-sm font-medium text-content-secondary">
                      Conversation Settings
                    </h3>
                    {/* Messages in Context */}
                    <div
                      className={cn(
                        'rounded-lg border border-border-subtle p-4',
                        isDarkMode ? 'bg-surface-sidebar' : 'bg-white',
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="mr-3 flex-1">
                          <div className="font-aeonik text-sm font-medium text-content-primary">
                            Messages in Context
                          </div>
                          <div className="font-aeonik-fono text-xs text-content-muted">
                            Maximum number of recent messages sent to the model
                            (1-
                            {CONSTANTS.MAX_PROMPT_MESSAGES_LIMIT}). Longer
                            contexts increase network usage and slow down
                            responses.
                          </div>
                        </div>
                        <input
                          type="number"
                          min="1"
                          max={CONSTANTS.MAX_PROMPT_MESSAGES_LIMIT}
                          value={maxMessages}
                          onChange={(e) => {
                            const value = parseInt(e.target.value, 10)
                            if (!isNaN(value)) {
                              handleMaxMessagesChange(value)
                            }
                          }}
                          className={cn(
                            'w-16 rounded-md border px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500',
                            isDarkMode
                              ? 'border-border-strong bg-surface-chat text-content-secondary'
                              : 'border-border-subtle bg-surface-sidebar text-content-primary',
                          )}
                        />
                      </div>
                    </div>

                    {/* Response Language */}
                    <div
                      className={cn(
                        'rounded-lg border border-border-subtle p-4',
                        isDarkMode ? 'bg-surface-sidebar' : 'bg-white',
                      )}
                    >
                      <div className="space-y-3">
                        <div>
                          <div className="font-aeonik text-sm font-medium text-content-primary">
                            Response Language
                          </div>
                          <div className="font-aeonik-fono text-xs text-content-muted">
                            Language for AI responses
                          </div>
                        </div>
                        <select
                          value={language}
                          onChange={(e) => handleLanguageChange(e.target.value)}
                          className={cn(
                            'w-full rounded-md border py-2 pl-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500',
                            isDarkMode
                              ? 'border-border-strong bg-surface-chat text-content-secondary'
                              : 'border-border-subtle bg-surface-sidebar text-content-primary',
                          )}
                        >
                          {availableLanguages.map((lang) => (
                            <option key={lang} value={lang}>
                              {lang}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Custom System Prompt */}
                  <div className="space-y-3">
                    <h3 className="font-aeonik text-sm font-medium text-content-secondary">
                      Custom System Prompt
                    </h3>

                    <div
                      className={cn(
                        'rounded-lg border border-border-subtle p-4',
                        isDarkMode ? 'bg-surface-sidebar' : 'bg-white',
                      )}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="font-aeonik-fono text-xs text-content-muted">
                            Override the default system prompt to customize how
                            Tin behaves.
                          </div>
                          <label className="relative inline-flex cursor-pointer items-center">
                            <input
                              type="checkbox"
                              checked={isUsingCustomPrompt}
                              onChange={(e) =>
                                handleToggleCustomPrompt(e.target.checked)
                              }
                              className="peer sr-only"
                            />
                            <div className="peer h-5 w-9 rounded-full border border-border-subtle bg-content-muted/40 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-content-muted/70 after:shadow-sm after:transition-all after:content-[''] peer-checked:bg-brand-accent-light peer-checked:after:translate-x-full peer-checked:after:bg-white peer-focus:outline-none" />
                          </label>
                        </div>
                        <textarea
                          value={stripSystemTags(customSystemPrompt)}
                          onChange={(e) =>
                            handleCustomPromptChange(e.target.value)
                          }
                          onBlur={handleCustomPromptBlur}
                          placeholder="Enter your custom system prompt..."
                          rows={6}
                          onFocus={() => {
                            if (!isUsingCustomPrompt) {
                              handleToggleCustomPrompt(true)
                            }
                          }}
                          className={cn(
                            'w-full resize-none rounded-md border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500',
                            isDarkMode
                              ? 'border-border-strong bg-surface-chat text-content-secondary placeholder:text-content-muted'
                              : 'border-border-subtle bg-surface-sidebar text-content-primary placeholder:text-content-muted',
                          )}
                        />
                        <div className="rounded-lg border border-border-subtle bg-surface-chat p-3">
                          <div className="font-aeonik-fono text-xs text-content-muted">
                            <span
                              className={cn(
                                'font-aeonik font-medium',
                                isDarkMode
                                  ? 'text-emerald-400'
                                  : 'text-emerald-600',
                              )}
                            >
                              Tip:
                            </span>{' '}
                            Use placeholders like {'{USER_PREFERENCES}'},{' '}
                            {'{LANGUAGE}'}, {'{CURRENT_DATETIME}'}, and{' '}
                            {'{TIMEZONE}'} to tell the model about your
                            preferences, timezone, and the current time and
                            date.
                          </div>
                        </div>
                        {isUsingCustomPrompt && (
                          <div className="flex justify-center">
                            <button
                              onClick={handleRestoreDefaultPrompt}
                              className={cn(
                                'rounded-md px-3 py-1.5 text-xs transition-all hover:underline',
                                isDarkMode
                                  ? 'text-red-400 hover:text-red-300'
                                  : 'text-red-600 hover:text-red-500',
                              )}
                            >
                              Restore default prompt
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Advanced Settings */}
                  <div className="space-y-3">
                    <button
                      onClick={() =>
                        setAdvancedSettingsOpen(!advancedSettingsOpen)
                      }
                      className="flex w-full items-center justify-between"
                    >
                      <h3 className="font-aeonik text-sm font-medium text-content-secondary">
                        Advanced Settings
                      </h3>
                      <ChevronDownIcon
                        className={cn(
                          'h-4 w-4 text-content-muted transition-transform',
                          advancedSettingsOpen && 'rotate-180',
                        )}
                      />
                    </button>

                    {advancedSettingsOpen && (
                      <div className="space-y-4">
                        {/* Web Search PII Detection */}
                        <div
                          className={cn(
                            'rounded-lg border border-border-subtle p-4',
                            isDarkMode ? 'bg-surface-sidebar' : 'bg-white',
                          )}
                        >
                          <div className="flex items-start justify-between">
                            <div className="mr-3 flex-1">
                              <div className="font-aeonik text-sm font-medium text-content-primary">
                                Automatic PII Blocking in Web Search
                              </div>
                              <div className="font-aeonik-fono text-xs text-content-muted">
                                When web search is enabled, queries containing
                                personal information will be blocked.
                              </div>
                            </div>
                            <label className="relative inline-flex cursor-pointer items-center">
                              <input
                                type="checkbox"
                                checked={piiCheckEnabled}
                                onChange={(e) => {
                                  const newValue = e.target.checked
                                  setPiiCheckEnabled(newValue)
                                  if (isClient) {
                                    localStorage.setItem(
                                      'piiCheckEnabled',
                                      newValue.toString(),
                                    )
                                    window.dispatchEvent(
                                      new CustomEvent(
                                        'piiCheckEnabledChanged',
                                        {
                                          detail: { enabled: newValue },
                                        },
                                      ),
                                    )
                                  }
                                }}
                                className="peer sr-only"
                              />
                              <div className="peer h-5 w-9 rounded-full border border-border-subtle bg-content-muted/40 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-content-muted/70 after:shadow-sm after:transition-all after:content-[''] peer-checked:bg-brand-accent-light peer-checked:after:translate-x-full peer-checked:after:bg-white peer-focus:outline-none" />
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Personalization Tab */}
              {activeTab === 'personalization' && (
                <>
                  {/* Nickname */}
                  <div
                    className={cn(
                      'rounded-lg border border-border-subtle p-4',
                      isDarkMode ? 'bg-surface-sidebar' : 'bg-white',
                    )}
                  >
                    <div className="space-y-3">
                      <div>
                        <div className="font-aeonik text-sm font-medium text-content-primary">
                          Name
                        </div>
                        <div className="font-aeonik-fono text-xs text-content-muted">
                          How should Tin call you?
                        </div>
                      </div>
                      <input
                        type="text"
                        value={nickname}
                        onChange={(e) => handleNicknameChange(e.target.value)}
                        placeholder="Nickname"
                        className={cn(
                          'w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500',
                          isDarkMode
                            ? 'border-border-strong bg-surface-chat text-content-secondary placeholder:text-content-muted'
                            : 'border-border-subtle bg-surface-sidebar text-content-primary placeholder:text-content-muted',
                        )}
                      />
                    </div>
                  </div>

                  {/* Profession */}
                  <div
                    className={cn(
                      'rounded-lg border border-border-subtle p-4',
                      isDarkMode ? 'bg-surface-sidebar' : 'bg-white',
                    )}
                  >
                    <div className="space-y-3">
                      <div>
                        <div className="font-aeonik text-sm font-medium text-content-primary">
                          Occupation
                        </div>
                        <div className="font-aeonik-fono text-xs text-content-muted">
                          What do you do?
                        </div>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          value={profession}
                          onChange={(e) =>
                            handleProfessionChange(e.target.value)
                          }
                          className={cn(
                            'w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500',
                            isDarkMode
                              ? 'border-border-strong bg-surface-chat text-content-secondary'
                              : 'border-border-subtle bg-surface-sidebar text-content-primary',
                          )}
                        />
                        {!profession && (
                          <span
                            className={cn(
                              'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-content-muted transition-opacity duration-150',
                              placeholderVisible ? 'opacity-100' : 'opacity-0',
                            )}
                          >
                            {getCurrentPlaceholder()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Traits */}
                  <div
                    className={cn(
                      'rounded-lg border border-border-subtle p-4',
                      isDarkMode ? 'bg-surface-sidebar' : 'bg-white',
                    )}
                  >
                    <div className="space-y-3">
                      <div>
                        <div className="font-aeonik text-sm font-medium text-content-primary">
                          Conversational Traits
                        </div>
                        <div className="font-aeonik-fono text-xs text-content-muted">
                          What traits should Tin have?
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {availableTraits.map((trait) => (
                          <button
                            key={trait}
                            onClick={() => handleTraitToggle(trait)}
                            className={cn(
                              'rounded-full px-2 py-1 text-xs transition-colors',
                              selectedTraits.includes(trait)
                                ? 'bg-brand-accent-light text-brand-accent-dark'
                                : isDarkMode
                                  ? 'bg-surface-chat text-content-secondary hover:bg-surface-chat'
                                  : 'bg-surface-sidebar text-content-secondary hover:bg-surface-sidebar',
                            )}
                          >
                            {selectedTraits.includes(trait) ? '✓ ' : '+ '}
                            {trait}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Additional Context */}
                  <div
                    className={cn(
                      'rounded-lg border border-border-subtle p-4',
                      isDarkMode ? 'bg-surface-sidebar' : 'bg-white',
                    )}
                  >
                    <div className="space-y-3">
                      <div>
                        <div className="font-aeonik text-sm font-medium text-content-primary">
                          Additional Context
                        </div>
                        <div className="font-aeonik-fono text-xs text-content-muted">
                          Anything else Tin should know about you?
                        </div>
                      </div>
                      <textarea
                        value={additionalContext}
                        onChange={(e) => handleContextChange(e.target.value)}
                        placeholder="Interests and other preferences you'd like Tin to know about you."
                        rows={3}
                        className={cn(
                          'w-full resize-none rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500',
                          isDarkMode
                            ? 'border-border-strong bg-surface-chat text-content-secondary placeholder:text-content-muted'
                            : 'border-border-subtle bg-surface-sidebar text-content-primary placeholder:text-content-muted',
                        )}
                      />
                    </div>
                  </div>

                  {/* Reset Button */}
                  <button
                    onClick={handleResetPersonalization}
                    className="rounded border border-border-subtle bg-surface-chat px-2 py-1 text-xs font-medium text-content-primary transition-colors hover:bg-surface-chat/80"
                  >
                    Reset all fields
                  </button>
                </>
              )}

              {/* Account Tab */}
              {activeTab === 'account' && (
                <>
                  {isSignedIn ? (
                    <>
                      {/* User Info */}
                      <div
                        className={cn(
                          'rounded-lg border border-border-subtle p-4',
                          isDarkMode ? 'bg-surface-sidebar' : 'bg-white',
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <UserButton
                            appearance={{
                              elements: {
                                avatarBox: 'w-12 h-12',
                              },
                            }}
                          />
                          <div>
                            <div className="font-aeonik text-base font-medium text-content-primary">
                              {user?.firstName
                                ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`
                                : user?.emailAddresses?.[0]?.emailAddress ||
                                  'User'}
                            </div>
                            <div className="text-sm text-content-muted">
                              {user?.emailAddresses?.[0]?.emailAddress}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Subscription Status */}
                      <div className="space-y-3">
                        <h3 className="font-aeonik text-sm font-medium text-content-secondary">
                          Subscription
                        </h3>
                        <div
                          className={cn(
                            'rounded-lg border border-border-subtle p-4',
                            isDarkMode ? 'bg-surface-sidebar' : 'bg-white',
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-aeonik text-sm font-medium text-content-primary">
                                {isPremium ? 'Premium' : 'Free Tier'}
                              </div>
                              <div className="font-aeonik-fono text-xs text-content-muted">
                                {isPremium
                                  ? 'You have access to all premium features'
                                  : 'Upgrade to unlock premium features'}
                              </div>
                            </div>
                            <div
                              className={cn(
                                'rounded-full px-3 py-1 text-xs font-medium',
                                isPremium
                                  ? 'bg-emerald-500/20 text-emerald-500'
                                  : 'bg-content-muted/20 text-content-muted',
                              )}
                            >
                              {isPremium ? 'Active' : 'Free'}
                            </div>
                          </div>
                        </div>

                        {isPremium ? (
                          <button
                            onClick={() => {
                              void handleManageBilling()
                            }}
                            disabled={billingLoading}
                            className={cn(
                              'flex w-full items-center justify-between rounded-lg border border-border-subtle p-4 transition-colors hover:bg-surface-chat',
                              isDarkMode ? 'bg-surface-sidebar' : 'bg-white',
                              billingLoading && 'cursor-not-allowed opacity-70',
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <CreditCardIcon className="h-5 w-5 text-content-muted" />
                              <div className="text-left">
                                <div className="font-aeonik text-sm font-medium text-content-primary">
                                  Manage Billing
                                </div>
                                <div className="font-aeonik-fono text-xs text-content-muted">
                                  Update payment method, view invoices
                                </div>
                              </div>
                            </div>
                            <div className="text-sm text-content-muted">
                              {billingLoading ? '...' : '→'}
                            </div>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              void handleUpgradeToPro()
                            }}
                            disabled={upgradeLoading}
                            className={cn(
                              'w-full rounded-md bg-brand-accent-dark px-4 py-3 text-sm font-medium text-white transition-all hover:bg-brand-accent-dark/90',
                              upgradeLoading && 'cursor-not-allowed opacity-70',
                            )}
                          >
                            {upgradeLoading
                              ? 'Redirecting…'
                              : 'Subscribe to Premium'}
                          </button>
                        )}

                        {upgradeError && (
                          <p className="text-xs text-destructive">
                            {upgradeError}
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div
                        className={cn(
                          'rounded-lg border border-border-subtle p-6 text-center',
                          isDarkMode ? 'bg-surface-sidebar' : 'bg-white',
                        )}
                      >
                        <UserCircleIcon className="mx-auto h-12 w-12 text-content-muted" />
                        <h3 className="mt-3 font-aeonik text-base font-medium text-content-primary">
                          Sign in to your account
                        </h3>
                        <p className="mt-1 text-sm text-content-muted">
                          Sign in to sync your settings and access premium
                          features
                        </p>
                        <SignInButton mode="modal">
                          <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-brand-accent-dark px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-brand-accent-dark/90">
                            <PiSignIn className="h-4 w-4" />
                            Sign in or sign up
                          </button>
                        </SignInButton>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
