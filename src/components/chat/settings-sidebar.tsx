/* eslint-disable react/no-unescaped-entities */
import { cn } from '@/components/ui/utils'
import { encryptionService } from '@/services/encryption/encryption-service'
import { chatStorage } from '@/services/storage/chat-storage'
import {
  isCloudSyncEnabled,
  setCloudSyncEnabled,
} from '@/utils/cloud-sync-settings'
import { logInfo } from '@/utils/error-handling'
import {
  CloudArrowUpIcon,
  Cog6ToothIcon,
  KeyIcon,
  MoonIcon,
  SunIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
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
}: SettingsSidebarProps) {
  const [maxMessages, setMaxMessages] = useState<number>(
    CONSTANTS.MAX_PROMPT_MESSAGES,
  )

  // Structured personalization fields
  const [nickname, setNickname] = useState<string>('')
  const [profession, setProfession] = useState<string>('')
  const [selectedTraits, setSelectedTraits] = useState<string[]>([])
  const [additionalContext, setAdditionalContext] = useState<string>('')
  const [isUsingPersonalization, setIsUsingPersonalization] =
    useState<boolean>(false)

  // Language setting (separate from personalization)
  const [language, setLanguage] = useState<string>('')

  // Custom system prompt settings
  const [isUsingCustomPrompt, setIsUsingCustomPrompt] = useState<boolean>(false)
  const [customSystemPrompt, setCustomSystemPrompt] = useState<string>('')

  // Cloud sync setting
  const [cloudSyncEnabled, setCloudSyncEnabledState] = useState<boolean>(false)

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

  // Use a cycling placeholder based on current time
  const getCurrentPlaceholder = () => {
    const index = Math.floor(Date.now() / 2000) % professionPlaceholders.length
    return professionPlaceholders[index]
  }

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
      if (!isNaN(parsedValue) && parsedValue > 0 && parsedValue <= 50) {
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
  }, [defaultSystemPrompt])

  // Initial load settings from localStorage
  useEffect(() => {
    if (isClient) {
      loadSettingsFromStorage()

      // Set default language if not already set
      const savedLanguage = localStorage.getItem('userLanguage')
      if (!savedLanguage) {
        // Get user's locale and set as default
        const userLocale = navigator.language || 'en-US'
        const languageName =
          new Intl.DisplayNames([userLocale], { type: 'language' }).of(
            userLocale.split('-')[0],
          ) || 'English'
        setLanguage(languageName)
        localStorage.setItem('userLanguage', languageName)
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
    if (value > 0 && value <= 50) {
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
    // Reset language to user's locale
    const userLocale = navigator.language || 'en-US'
    const languageName =
      new Intl.DisplayNames([userLocale], { type: 'language' }).of(
        userLocale.split('-')[0],
      ) || 'English'
    setLanguage(languageName)

    if (isClient) {
      localStorage.removeItem('userNickname')
      localStorage.removeItem('userProfession')
      localStorage.removeItem('userTraits')
      localStorage.removeItem('userAdditionalContext')
      localStorage.setItem('userLanguage', languageName)
      saveLanguageSetting(languageName)
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
        // Turn on the toggle visually
        setCloudSyncEnabledState(true)
        setCloudSyncEnabled(true)

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

      // Clear encryption key to prevent auto-enable on refresh
      localStorage.removeItem('tinfoil-encryption-key')

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

  return (
    <>
      {/* Settings sidebar */}
      <motion.div
        initial={false}
        animate={{
          x: isOpen ? 0 : '100%',
        }}
        transition={{
          type: 'spring',
          damping: 30,
          stiffness: 300,
        }}
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-[85vw] flex-col overflow-hidden border-l font-aeonik',
          'border-border-subtle bg-surface-sidebar text-content-primary',
        )}
        style={{ maxWidth: `${CONSTANTS.SETTINGS_SIDEBAR_WIDTH_PX}px` }}
      >
        {/* Header */}
        <div className="flex h-16 flex-none items-center justify-between border-b border-border-subtle p-4">
          <div className="flex items-center gap-2">
            <Cog6ToothIcon className="h-6 w-6 text-content-primary" />
            <h2 className="font-aeonik text-lg font-semibold text-content-primary">
              Settings
            </h2>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-lg border border-border-subtle bg-surface-chat p-2 text-content-secondary transition-all duration-200 hover:bg-surface-chat/80"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Settings content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6">
            {/* Warning when cloud sync is disabled */}
            {!cloudSyncEnabled && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  <strong>Note:</strong> Cloud sync is disabled. Your chats,
                  settings, and personalization preferences are stored locally
                  on this browser and won't sync across devices.
                </p>
              </div>
            )}

            {/* Encrypted Cloud Sync section - moved to top */}
            {onEncryptionKeyClick && (
              <div>
                <h3
                  className={`mb-3 font-aeonik text-sm font-medium ${'text-content-secondary'}`}
                >
                  Encrypted Cloud Sync
                </h3>
                <div className="space-y-2">
                  {/* Cloud Sync Toggle */}
                  <div className="rounded-lg border border-border-subtle p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CloudArrowUpIcon
                          className={`h-5 w-5 ${'text-content-muted'}`}
                        />
                        <div className="text-left">
                          <div
                            className={`font-aeonik text-sm font-medium ${'text-content-secondary'}`}
                          >
                            Cloud Sync
                          </div>
                          <div
                            className={`font-aeonik-fono text-xs ${'text-content-muted'}`}
                          >
                            {cloudSyncEnabled
                              ? 'Chats are synced to cloud'
                              : 'Chats are stored locally only'}
                          </div>
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

                  {/* Encryption Key Management - only show when cloud sync is enabled */}
                  {cloudSyncEnabled && (
                    <button
                      onClick={onEncryptionKeyClick}
                      className="flex w-full items-center justify-between rounded-lg border border-border-subtle p-3 transition-colors hover:bg-surface-chat/80"
                    >
                      <div className="flex items-center gap-3">
                        <KeyIcon
                          className={`h-5 w-5 ${'text-content-muted'}`}
                        />
                        <div className="text-left">
                          <div
                            className={`font-aeonik text-sm font-medium ${'text-content-secondary'}`}
                          >
                            Encryption Key
                          </div>
                          <div
                            className={`font-aeonik-fono text-xs ${'text-content-muted'}`}
                          >
                            Manage your chat encryption key
                          </div>
                        </div>
                      </div>
                      <div className={`text-xs ${'text-content-muted'}`}>→</div>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Appearance section */}
            <div>
              <h3
                className={`mb-3 font-aeonik text-sm font-medium ${'text-content-secondary'}`}
              >
                Appearance
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-sidebar p-3">
                  <div>
                    <div
                      className={`font-aeonik text-sm font-medium ${'text-content-secondary'}`}
                    >
                      Theme
                    </div>
                    <div
                      className={`font-aeonik-fono text-xs ${'text-content-muted'}`}
                    >
                      Choose between light and dark mode
                    </div>
                  </div>
                  <button
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
            </div>

            {/* Chat Settings */}
            <div>
              <h3
                className={`mb-3 font-aeonik text-sm font-medium ${'text-content-secondary'}`}
              >
                Chat Settings
              </h3>
              <div className="space-y-2">
                <div className="rounded-lg border border-border-subtle p-3">
                  <div className="flex items-start justify-between">
                    <div className="mr-3 flex-1">
                      <div
                        className={`font-aeonik text-sm font-medium ${'text-content-secondary'}`}
                      >
                        Messages in Context
                      </div>
                      <div
                        className={`font-aeonik-fono text-xs ${'text-content-muted'}`}
                      >
                        Maximum number of recent messages sent to the model
                        (1-50). Longer contexts increase network usage and slow
                        down responses.
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={maxMessages}
                        onChange={(e) => {
                          const value = parseInt(e.target.value, 10)
                          if (!isNaN(value)) {
                            handleMaxMessagesChange(value)
                          }
                        }}
                        className={`w-16 rounded-md border px-2 py-1 text-center text-sm ${
                          isDarkMode
                            ? 'border-border-strong bg-surface-chat text-content-secondary'
                            : 'border-border-subtle bg-surface-sidebar text-content-primary'
                        } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                      />
                    </div>
                  </div>
                </div>

                {/* Language Setting */}
                <div className="rounded-lg border border-border-subtle p-3">
                  <div className="space-y-2">
                    <div>
                      <div
                        className={`font-aeonik text-sm font-medium ${'text-content-secondary'}`}
                      >
                        Response Language
                      </div>
                      <div
                        className={`font-aeonik-fono text-xs ${'text-content-muted'}`}
                      >
                        Language for AI responses
                      </div>
                    </div>
                    <select
                      value={language}
                      onChange={(e) => handleLanguageChange(e.target.value)}
                      className={`w-full rounded-md border py-2 pl-3 pr-8 text-sm ${
                        isDarkMode
                          ? 'border-border-strong bg-surface-chat text-content-secondary'
                          : 'border-border-subtle bg-surface-sidebar text-content-primary'
                      } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                    >
                      {availableLanguages.map((lang) => (
                        <option key={lang} value={lang}>
                          {lang}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Custom System Prompt Settings */}
                <div className="rounded-lg border border-border-subtle p-3">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div
                          className={`font-aeonik text-sm font-medium ${'text-content-secondary'}`}
                        >
                          Custom System Prompt
                        </div>
                        <div
                          className={`font-aeonik-fono text-xs ${'text-content-muted'}`}
                        >
                          Override the default system prompt
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
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
                    </div>

                    {isUsingCustomPrompt && (
                      <div className="space-y-2">
                        <textarea
                          value={stripSystemTags(customSystemPrompt)}
                          onChange={(e) =>
                            handleCustomPromptChange(e.target.value)
                          }
                          onBlur={handleCustomPromptBlur}
                          placeholder="Enter your custom system prompt..."
                          rows={6}
                          className={`w-full resize-none rounded-md border px-3 py-2 font-mono text-sm ${
                            isDarkMode
                              ? 'border-border-strong bg-surface-chat text-content-secondary placeholder:text-content-muted'
                              : 'border-border-subtle bg-surface-sidebar text-content-primary placeholder:text-content-muted'
                          } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                        />
                        <div className="rounded-lg border border-border-subtle p-3">
                          <div
                            className={`font-aeonik-fono text-xs ${'text-content-muted'}`}
                          >
                            <span
                              className={`font-aeonik font-medium ${
                                isDarkMode
                                  ? 'text-emerald-400'
                                  : 'text-emerald-600'
                              }`}
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
                        <div className="flex justify-center">
                          <button
                            onClick={handleRestoreDefaultPrompt}
                            className={`rounded-md px-3 py-1.5 text-xs transition-all ${
                              isDarkMode
                                ? 'text-red-400 hover:text-red-300'
                                : 'text-red-600 hover:text-red-500'
                            } hover:underline`}
                          >
                            Restore default prompt
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Personalization Settings */}
                <div className="rounded-lg border border-border-subtle p-3">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div
                          className={`font-aeonik text-sm font-medium ${'text-content-secondary'}`}
                        >
                          Personalization
                        </div>
                        <div
                          className={`font-aeonik-fono text-xs ${'text-content-muted'}`}
                        >
                          Customize the AI's behavior and responses
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="relative inline-flex cursor-pointer items-center">
                          <input
                            type="checkbox"
                            checked={isUsingPersonalization}
                            onChange={(e) =>
                              handleTogglePersonalization(e.target.checked)
                            }
                            className="peer sr-only"
                          />
                          <div className="peer h-5 w-9 rounded-full border border-border-subtle bg-content-muted/40 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-content-muted/70 after:shadow-sm after:transition-all after:content-[''] peer-checked:bg-brand-accent-light peer-checked:after:translate-x-full peer-checked:after:bg-white peer-focus:outline-none" />
                        </label>
                      </div>
                    </div>

                    {isUsingPersonalization && (
                      <div className="space-y-4">
                        {/* Nickname Field */}
                        <div>
                          <label
                            className={`mb-1 block font-aeonik text-xs font-medium ${'text-content-secondary'}`}
                          >
                            How should Tin call you?
                          </label>
                          <input
                            type="text"
                            value={nickname}
                            onChange={(e) =>
                              handleNicknameChange(e.target.value)
                            }
                            placeholder="Nickname"
                            className={`w-full rounded-md border px-3 py-2 text-sm ${
                              isDarkMode
                                ? 'border-border-strong bg-surface-chat text-content-secondary placeholder:text-content-muted'
                                : 'border-border-subtle bg-surface-sidebar text-content-primary placeholder:text-content-muted'
                            } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                          />
                        </div>

                        {/* Profession Field */}
                        <div>
                          <label
                            className={`mb-1 block font-aeonik text-xs font-medium ${'text-content-secondary'}`}
                          >
                            What do you do?
                          </label>
                          <input
                            type="text"
                            value={profession}
                            onChange={(e) =>
                              handleProfessionChange(e.target.value)
                            }
                            placeholder={getCurrentPlaceholder()}
                            className={`w-full rounded-md border px-3 py-2 text-sm ${
                              isDarkMode
                                ? 'border-border-strong bg-surface-chat text-content-secondary placeholder:text-content-muted'
                                : 'border-border-subtle bg-surface-sidebar text-content-primary placeholder:text-content-muted'
                            } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                          />
                        </div>

                        {/* Traits Selection */}
                        <div>
                          <label
                            className={`mb-2 block font-aeonik text-xs font-medium ${'text-content-secondary'}`}
                          >
                            What conversational traits should Tin have?
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {availableTraits.map((trait) => (
                              <button
                                key={trait}
                                onClick={() => handleTraitToggle(trait)}
                                className={`rounded-full px-2 py-1 text-xs transition-colors ${
                                  selectedTraits.includes(trait)
                                    ? 'bg-brand-accent-light text-brand-accent-dark'
                                    : isDarkMode
                                      ? 'bg-surface-chat text-content-secondary hover:bg-surface-chat'
                                      : 'bg-surface-sidebar text-content-secondary hover:bg-surface-sidebar'
                                }`}
                              >
                                {selectedTraits.includes(trait) ? '✓ ' : '+ '}
                                {trait}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Additional Context */}
                        <div>
                          <label
                            className={`mb-1 block font-aeonik text-xs font-medium ${'text-content-secondary'}`}
                          >
                            Anything else Tin should know about you?
                          </label>
                          <textarea
                            value={additionalContext}
                            onChange={(e) =>
                              handleContextChange(e.target.value)
                            }
                            placeholder="Interests and other preferences you'd like Tin to know about you."
                            rows={3}
                            className={`w-full resize-none rounded-md border px-3 py-2 text-sm ${
                              isDarkMode
                                ? 'border-border-strong bg-surface-chat text-content-secondary placeholder:text-content-muted'
                                : 'border-border-subtle bg-surface-sidebar text-content-primary placeholder:text-content-muted'
                            } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                          />
                        </div>

                        {/* Reset Button */}
                        <div className="flex items-center justify-between">
                          <button
                            onClick={handleResetPersonalization}
                            className="rounded border border-border-subtle bg-surface-chat px-2 py-1 text-xs font-medium text-content-primary transition-colors hover:bg-surface-chat/80"
                          >
                            Reset all fields
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}
