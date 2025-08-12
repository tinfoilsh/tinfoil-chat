import { CLOUD_SYNC } from '@/config'
import { profileSync, type ProfileData } from '@/services/cloud/profile-sync'
import { logError, logInfo } from '@/utils/error-handling'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useRef } from 'react'

export function useProfileSync() {
  const { getToken, isSignedIn } = useAuth()
  const hasInitialized = useRef(false)
  const syncDebounceTimer = useRef<NodeJS.Timeout | null>(null)
  const lastSyncedVersion = useRef<number>(0)
  const hasPendingChanges = useRef(false)
  const lastSyncedProfile = useRef<ProfileData | null>(null)

  // Set token getter when auth changes
  useEffect(() => {
    profileSync.setTokenGetter(getToken)
  }, [getToken])

  // Helper to check if profile content has changed (excluding metadata)
  const hasProfileChanged = useCallback(
    (profile1: ProfileData | null, profile2: ProfileData | null): boolean => {
      if (!profile1 || !profile2) return profile1 !== profile2

      return (
        profile1.isDarkMode !== profile2.isDarkMode ||
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
    },
    [],
  )

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

    // Skip sync if we have pending local changes
    if (hasPendingChanges.current) {
      logInfo('Skipping cloud sync - local changes pending', {
        component: 'ProfileSync',
        action: 'syncFromCloud',
      })
      return
    }

    try {
      const cloudProfile = await profileSync.fetchProfile()

      if (cloudProfile) {
        const cloudVersion = cloudProfile.version || 0

        // Check if the cloud profile is actually different from what we have
        if (hasProfileChanged(cloudProfile, lastSyncedProfile.current)) {
          // Apply cloud settings to localStorage
          applySettingsToLocal(cloudProfile)
          lastSyncedVersion.current = cloudVersion
          lastSyncedProfile.current = cloudProfile

          logInfo('Profile synced from cloud', {
            component: 'ProfileSync',
            action: 'syncFromCloud',
            metadata: { version: cloudVersion },
          })
        } else {
          logInfo('Cloud profile unchanged', {
            component: 'ProfileSync',
            action: 'syncFromCloud',
          })
        }
      }
    } catch (error) {
      logError('Failed to sync profile from cloud', error, {
        component: 'ProfileSync',
        action: 'syncFromCloud',
      })
    }
  }, [isSignedIn, applySettingsToLocal, hasProfileChanged])

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

        // Check if local settings are different from last synced profile
        if (!hasProfileChanged(localSettings, lastSyncedProfile.current)) {
          logInfo('Skipping cloud sync - no changes detected', {
            component: 'ProfileSync',
            action: 'syncToCloud',
          })
          hasPendingChanges.current = false
          return
        }

        // Mark that we have pending changes only when we're actually going to sync
        hasPendingChanges.current = true

        // Include the last synced version so the service can increment it
        const profileWithVersion = {
          ...localSettings,
          version: lastSyncedVersion.current,
        }

        const result = await profileSync.saveProfile(profileWithVersion)

        if (result.success) {
          // Use the actual version returned from the service
          if (result.version !== undefined) {
            lastSyncedVersion.current = result.version
          }
          lastSyncedProfile.current = localSettings
          hasPendingChanges.current = false

          logInfo('Profile synced to cloud', {
            component: 'ProfileSync',
            action: 'syncToCloud',
            metadata: {
              version: lastSyncedVersion.current,
            },
          })
        }
      } catch (error) {
        logError('Failed to sync profile to cloud', error, {
          component: 'ProfileSync',
          action: 'syncToCloud',
        })
        // Keep pending changes flag on error
      } finally {
        // Clear pending changes after a reasonable time even on error
        // to prevent permanent blocking of cloud sync
        setTimeout(() => {
          hasPendingChanges.current = false
        }, 10000) // 10 seconds
      }
    }, 2000) // 2 second debounce
  }, [isSignedIn, loadLocalSettings, hasProfileChanged])

  // Initial sync when authenticated and periodic sync
  useEffect(() => {
    if (!isSignedIn) {
      hasInitialized.current = false
      hasPendingChanges.current = false
      lastSyncedVersion.current = 0
      lastSyncedProfile.current = null
      profileSync.clearCache()
      return
    }

    if (!hasInitialized.current) {
      hasInitialized.current = true
      logInfo('Initializing profile sync', {
        component: 'useProfileSync',
        action: 'initialize',
      })
      // Initial sync on page load - this will also set lastSyncedVersion
      syncFromCloud().then(() => {
        // After initial sync, get the current cloud version and profile
        const cachedProfile = profileSync.getCachedProfile()
        if (cachedProfile) {
          if (cachedProfile.version) {
            lastSyncedVersion.current = cachedProfile.version
          }
          lastSyncedProfile.current = cachedProfile
        }
      })
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
      'customSystemPromptChanged',
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
      // Update the synced version and profile after successful decryption
      if (decryptedProfile.version) {
        lastSyncedVersion.current = decryptedProfile.version
      }
      lastSyncedProfile.current = decryptedProfile
      logInfo('Profile decrypted and applied with new key', {
        component: 'ProfileSync',
        action: 'retryDecryption',
        metadata: {
          version: decryptedProfile.version,
        },
      })
    }
  }, [applySettingsToLocal])

  return {
    syncFromCloud,
    syncToCloud,
    retryDecryption,
  }
}
