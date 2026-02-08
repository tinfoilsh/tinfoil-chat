import type { ProfileData } from '@/services/cloud/profile-sync'

/**
 * Check if two profile data objects differ in any meaningful field (excluding metadata).
 */
export function hasProfileChanged(
  profile1: ProfileData | null,
  profile2: ProfileData | null,
): boolean {
  if (!profile1 || !profile2) return profile1 !== profile2

  return (
    profile1.isDarkMode !== profile2.isDarkMode ||
    profile1.themeMode !== profile2.themeMode ||
    profile1.maxPromptMessages !== profile2.maxPromptMessages ||
    profile1.language !== profile2.language ||
    profile1.nickname !== profile2.nickname ||
    profile1.profession !== profile2.profession ||
    JSON.stringify(profile1.traits) !== JSON.stringify(profile2.traits) ||
    profile1.additionalContext !== profile2.additionalContext ||
    profile1.isUsingPersonalization !== profile2.isUsingPersonalization ||
    profile1.isUsingCustomPrompt !== profile2.isUsingCustomPrompt ||
    profile1.customSystemPrompt !== profile2.customSystemPrompt
  )
}

/**
 * Load the current user settings from localStorage into a ProfileData object.
 */
export function loadLocalSettings(): ProfileData {
  const settings: ProfileData = {}

  // Theme
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme) {
    settings.isDarkMode = savedTheme === 'dark'
  }
  const savedThemeMode = localStorage.getItem('themeMode')
  if (
    savedThemeMode === 'light' ||
    savedThemeMode === 'dark' ||
    savedThemeMode === 'system'
  ) {
    settings.themeMode = savedThemeMode
  }

  // Chat settings
  const maxMessages = localStorage.getItem('maxPromptMessages')
  if (maxMessages) {
    settings.maxPromptMessages = parseInt(maxMessages, 10)
  }

  const language = localStorage.getItem('userLanguage')
  if (language) {
    settings.language = language
  }

  // Personalization
  const nickname = localStorage.getItem('userNickname')
  if (nickname) settings.nickname = nickname

  const profession = localStorage.getItem('userProfession')
  if (profession) settings.profession = profession

  const traits = localStorage.getItem('userTraits')
  if (traits) {
    try {
      settings.traits = JSON.parse(traits)
    } catch {
      settings.traits = []
    }
  }

  const additionalContext = localStorage.getItem('userAdditionalContext')
  if (additionalContext) settings.additionalContext = additionalContext

  const isUsingPersonalization = localStorage.getItem('isUsingPersonalization')
  if (isUsingPersonalization) {
    settings.isUsingPersonalization = isUsingPersonalization === 'true'
  }

  // Custom system prompt settings
  const isUsingCustomPrompt = localStorage.getItem('isUsingCustomPrompt')
  if (isUsingCustomPrompt) {
    settings.isUsingCustomPrompt = isUsingCustomPrompt === 'true'
  }

  const customSystemPrompt = localStorage.getItem('customSystemPrompt')
  if (customSystemPrompt) {
    settings.customSystemPrompt = customSystemPrompt
  }

  return settings
}

/**
 * Apply cloud-synced settings to localStorage and dispatch change events
 * so the UI reacts to the updated values.
 */
export function applySettingsToLocal(settings: ProfileData): void {
  // Theme - prefer themeMode if available, fall back to isDarkMode for backwards compatibility
  if (settings.themeMode) {
    localStorage.setItem('themeMode', settings.themeMode)
    // Also set legacy theme key
    if (settings.themeMode === 'system') {
      const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches
      localStorage.setItem('theme', prefersDark ? 'dark' : 'light')
    } else {
      localStorage.setItem('theme', settings.themeMode)
    }
    // Trigger theme change event
    window.dispatchEvent(
      new CustomEvent('themeChanged', {
        detail: settings.themeMode,
      }),
    )
  } else if (settings.isDarkMode !== undefined) {
    // Legacy: only isDarkMode available (old profile data)
    const theme = settings.isDarkMode ? 'dark' : 'light'
    localStorage.setItem('theme', theme)
    localStorage.setItem('themeMode', theme)
    // Trigger theme change event
    window.dispatchEvent(
      new CustomEvent('themeChanged', {
        detail: theme,
      }),
    )
  }

  // Chat settings
  if (settings.maxPromptMessages !== undefined) {
    localStorage.setItem(
      'maxPromptMessages',
      settings.maxPromptMessages.toString(),
    )
    window.dispatchEvent(
      new CustomEvent('maxPromptMessagesChanged', {
        detail: settings.maxPromptMessages,
      }),
    )
  }

  if (settings.language !== undefined) {
    localStorage.setItem('userLanguage', settings.language)
    window.dispatchEvent(
      new CustomEvent('languageChanged', {
        detail: { language: settings.language },
      }),
    )
  }

  // Personalization
  if (settings.nickname !== undefined) {
    localStorage.setItem('userNickname', settings.nickname)
  }

  if (settings.profession !== undefined) {
    localStorage.setItem('userProfession', settings.profession)
  }

  if (settings.traits !== undefined) {
    localStorage.setItem('userTraits', JSON.stringify(settings.traits))
  }

  if (settings.additionalContext !== undefined) {
    localStorage.setItem('userAdditionalContext', settings.additionalContext)
  }

  if (settings.isUsingPersonalization !== undefined) {
    localStorage.setItem(
      'isUsingPersonalization',
      settings.isUsingPersonalization.toString(),
    )
  }

  // Custom system prompt settings
  if (settings.isUsingCustomPrompt !== undefined) {
    localStorage.setItem(
      'isUsingCustomPrompt',
      settings.isUsingCustomPrompt.toString(),
    )
  }

  if (settings.customSystemPrompt !== undefined) {
    localStorage.setItem('customSystemPrompt', settings.customSystemPrompt)
  }

  // Trigger custom system prompt change event
  if (
    settings.isUsingCustomPrompt !== undefined ||
    settings.customSystemPrompt !== undefined
  ) {
    window.dispatchEvent(
      new CustomEvent('customSystemPromptChanged', {
        detail: {
          isEnabled:
            settings.isUsingCustomPrompt ??
            localStorage.getItem('isUsingCustomPrompt') === 'true',
          customPrompt:
            settings.customSystemPrompt ||
            localStorage.getItem('customSystemPrompt') ||
            '',
        },
      }),
    )
  }

  // Trigger personalization change event
  if (
    settings.nickname !== undefined ||
    settings.profession !== undefined ||
    settings.traits !== undefined ||
    settings.additionalContext !== undefined ||
    settings.isUsingPersonalization !== undefined
  ) {
    window.dispatchEvent(
      new CustomEvent('personalizationChanged', {
        detail: {
          nickname:
            settings.nickname || localStorage.getItem('userNickname') || '',
          profession:
            settings.profession || localStorage.getItem('userProfession') || '',
          traits:
            settings.traits ||
            (() => {
              try {
                return JSON.parse(localStorage.getItem('userTraits') || '[]')
              } catch {
                return []
              }
            })(),
          additionalContext:
            settings.additionalContext ||
            localStorage.getItem('userAdditionalContext') ||
            '',
          language:
            settings.language ||
            localStorage.getItem('userLanguage') ||
            'English',
          isEnabled:
            settings.isUsingPersonalization ??
            localStorage.getItem('isUsingPersonalization') === 'true',
        },
      }),
    )
  }
}
