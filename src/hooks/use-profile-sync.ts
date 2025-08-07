import { CLOUD_SYNC } from '@/config'
import { profileSync, type ProfileData } from '@/services/cloud/profile-sync'
import { logError, logInfo } from '@/utils/error-handling'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useRef } from 'react'

export function useProfileSync() {
  const { getToken, isSignedIn } = useAuth()
  const hasInitialized = useRef(false)
  const lastSyncTime = useRef<number>(0)
  const syncDebounceTimer = useRef<NodeJS.Timeout | null>(null)

  // Set token getter when auth changes
  useEffect(() => {
    profileSync.setTokenGetter(getToken)
  }, [getToken])

  // Load settings from localStorage
  const loadLocalSettings = useCallback((): ProfileData => {
    const settings: ProfileData = {}

    // Theme
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme) {
      settings.isDarkMode = savedTheme === 'dark'
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

    const isUsingPersonalization = localStorage.getItem(
      'isUsingPersonalization',
    )
    if (isUsingPersonalization) {
      settings.isUsingPersonalization = isUsingPersonalization === 'true'
    }

    return settings
  }, [])

  // Apply settings to localStorage
  const applySettingsToLocal = useCallback((settings: ProfileData) => {
    // Theme
    if (settings.isDarkMode !== undefined) {
      localStorage.setItem('theme', settings.isDarkMode ? 'dark' : 'light')
      // Trigger theme change event
      window.dispatchEvent(
        new CustomEvent('themeChanged', {
          detail: settings.isDarkMode ? 'dark' : 'light',
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
              settings.profession ||
              localStorage.getItem('userProfession') ||
              '',
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
  }, [])

  // Sync profile from cloud to local
  const syncFromCloud = useCallback(async () => {
    if (!isSignedIn) return

    try {
      const cloudProfile = await profileSync.fetchProfile()

      if (cloudProfile) {
        // Apply cloud settings to localStorage
        applySettingsToLocal(cloudProfile)

        logInfo('Profile synced from cloud', {
          component: 'ProfileSync',
          action: 'syncFromCloud',
          metadata: { version: cloudProfile.version },
        })
      }
    } catch (error) {
      logError('Failed to sync profile from cloud', error, {
        component: 'ProfileSync',
        action: 'syncFromCloud',
      })
    }
  }, [isSignedIn, applySettingsToLocal])

  // Sync profile from local to cloud (debounced)
  const syncToCloud = useCallback(async () => {
    if (!isSignedIn) return

    // Clear any existing debounce timer
    if (syncDebounceTimer.current) {
      clearTimeout(syncDebounceTimer.current)
    }

    // Debounce the sync to avoid too many API calls
    syncDebounceTimer.current = setTimeout(async () => {
      try {
        const localSettings = loadLocalSettings()
        const success = await profileSync.saveProfile(localSettings)

        if (success) {
          lastSyncTime.current = Date.now()
          logInfo('Profile synced to cloud', {
            component: 'ProfileSync',
            action: 'syncToCloud',
          })
        }
      } catch (error) {
        logError('Failed to sync profile to cloud', error, {
          component: 'ProfileSync',
          action: 'syncToCloud',
        })
      }
    }, 2000) // 2 second debounce
  }, [isSignedIn, loadLocalSettings])

  // Initial sync when authenticated and periodic sync
  useEffect(() => {
    if (!isSignedIn) {
      hasInitialized.current = false
      profileSync.clearCache()
      return
    }

    if (!hasInitialized.current) {
      hasInitialized.current = true
      logInfo('Initializing profile sync', {
        component: 'useProfileSync',
        action: 'initialize',
      })
      // Initial sync on page load
      syncFromCloud()
    }

    // Sync at regular intervals (same as chat sync)
    const interval = setInterval(() => {
      syncFromCloud()
    }, CLOUD_SYNC.SYNC_INTERVAL)

    return () => clearInterval(interval)
  }, [isSignedIn, syncFromCloud])

  // Listen for settings changes and sync to cloud
  useEffect(() => {
    if (!isSignedIn) return

    const handleSettingsChange = () => {
      syncToCloud()
    }

    // Listen for all settings change events
    const events = [
      'themeChanged',
      'maxPromptMessagesChanged',
      'personalizationChanged',
      'languageChanged',
    ]

    events.forEach((event) => {
      window.addEventListener(event, handleSettingsChange)
    })

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleSettingsChange)
      })

      // Clear debounce timer on cleanup
      if (syncDebounceTimer.current) {
        clearTimeout(syncDebounceTimer.current)
      }
    }
  }, [isSignedIn, syncToCloud])

  // Retry decryption when encryption key changes
  const retryDecryption = useCallback(async () => {
    const decryptedProfile = await profileSync.retryDecryptionWithNewKey()
    if (decryptedProfile) {
      applySettingsToLocal(decryptedProfile)
      logInfo('Profile decrypted and applied with new key', {
        component: 'ProfileSync',
        action: 'retryDecryption',
      })
    }
  }, [applySettingsToLocal])

  return {
    syncFromCloud,
    syncToCloud,
    retryDecryption,
  }
}
