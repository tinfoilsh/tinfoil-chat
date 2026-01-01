import { CLOUD_SYNC } from '@/config'
import { profileSync, type ProfileData } from '@/services/cloud/profile-sync'
import type { ProfileSyncStatus } from '@/services/cloud/r2-storage'
import { isCloudSyncEnabled } from '@/utils/cloud-sync-settings'
import { logError, logInfo } from '@/utils/error-handling'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useRef, useState } from 'react'

const PROFILE_SYNC_STATUS_KEY = 'tinfoil-profile-sync-status'

export function useProfileSync() {
  const { getToken, isSignedIn } = useAuth()
  const hasInitialized = useRef(false)
  const syncDebounceTimer = useRef<NodeJS.Timeout | null>(null)
  const lastSyncedVersion = useRef<number>(0)
  const hasPendingChanges = useRef(false)
  const lastSyncedProfile = useRef<ProfileData | null>(null)
  const cachedSyncStatus = useRef<ProfileSyncStatus | null>(null)
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(isCloudSyncEnabled())

  // Set token getter when auth changes
  useEffect(() => {
    profileSync.setTokenGetter(getToken)
  }, [getToken])

  // Load cached profile sync status
  const loadCachedSyncStatus = useCallback((): ProfileSyncStatus | null => {
    if (typeof window === 'undefined') return null
    try {
      const cached = localStorage.getItem(PROFILE_SYNC_STATUS_KEY)
      if (cached) {
        return JSON.parse(cached)
      }
    } catch {
      // Ignore parse errors
    }
    return null
  }, [])

  // Save profile sync status
  const saveSyncStatus = useCallback((status: ProfileSyncStatus): void => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(PROFILE_SYNC_STATUS_KEY, JSON.stringify(status))
      cachedSyncStatus.current = status
    } catch {
      // Ignore storage errors
    }
  }, [])

  // Listen for cloud sync setting changes
  useEffect(() => {
    const checkCloudSyncStatus = () => {
      setCloudSyncEnabled(isCloudSyncEnabled())
    }

    checkCloudSyncStatus()

    window.addEventListener('storage', checkCloudSyncStatus)
    window.addEventListener('cloudSyncSettingChanged', checkCloudSyncStatus)

    return () => {
      window.removeEventListener('storage', checkCloudSyncStatus)
      window.removeEventListener(
        'cloudSyncSettingChanged',
        checkCloudSyncStatus,
      )
    }
  }, [])

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
    if (!isSignedIn || !isCloudSyncEnabled()) return

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

        // Re-check pending changes after fetch to avoid race with local edits
        if (hasPendingChanges.current) {
          return
        }

        // Ignore stale cloud versions to prevent overwriting newer local state
        if (cloudVersion < lastSyncedVersion.current) {
          return
        }

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

  // Smart sync: check sync status first and only fetch profile if changed
  const smartSyncFromCloud = useCallback(async () => {
    if (!isSignedIn || !isCloudSyncEnabled()) return

    // Skip sync if we have pending local changes
    if (hasPendingChanges.current) {
      return
    }

    try {
      // Get remote sync status
      const remoteStatus = await profileSync.getSyncStatus()

      if (!remoteStatus) {
        return
      }

      // If no profile exists on server, nothing to sync
      if (!remoteStatus.exists) {
        return
      }

      // Get cached status
      const cached = cachedSyncStatus.current || loadCachedSyncStatus()

      // Check if we need to sync
      const needsSync =
        !cached ||
        !cached.exists ||
        cached.version !== remoteStatus.version ||
        cached.lastUpdated !== remoteStatus.lastUpdated

      if (!needsSync) {
        logInfo('Smart profile sync: no changes detected', {
          component: 'ProfileSync',
          action: 'smartSyncFromCloud',
          metadata: { version: remoteStatus.version },
        })
        return
      }

      logInfo('Smart profile sync: changes detected, fetching profile', {
        component: 'ProfileSync',
        action: 'smartSyncFromCloud',
        metadata: {
          cachedVersion: cached?.version,
          remoteVersion: remoteStatus.version,
        },
      })

      // Fetch the full profile since it changed
      const cloudProfile = await profileSync.fetchProfile()

      if (cloudProfile) {
        const cloudVersion = cloudProfile.version || 0

        // Re-check pending changes after fetch
        if (hasPendingChanges.current) {
          return
        }

        // Ignore stale versions
        if (cloudVersion < lastSyncedVersion.current) {
          return
        }

        // Apply if changed
        if (hasProfileChanged(cloudProfile, lastSyncedProfile.current)) {
          applySettingsToLocal(cloudProfile)
          lastSyncedVersion.current = cloudVersion
          lastSyncedProfile.current = cloudProfile
        }

        // Update cached sync status only after successful processing
        saveSyncStatus(remoteStatus)
      }
    } catch (error) {
      logError('Failed smart profile sync', error, {
        component: 'ProfileSync',
        action: 'smartSyncFromCloud',
      })
    }
  }, [
    isSignedIn,
    loadCachedSyncStatus,
    saveSyncStatus,
    applySettingsToLocal,
    hasProfileChanged,
  ])

  // Sync profile from local to cloud (debounced)
  const syncToCloud = useCallback(async () => {
    if (!isSignedIn || !isCloudSyncEnabled()) return

    // Clear any existing debounce timer
    if (syncDebounceTimer.current) {
      clearTimeout(syncDebounceTimer.current)
    }

    // Debounce the sync to avoid too many API calls
    syncDebounceTimer.current = setTimeout(async () => {
      if (!isCloudSyncEnabled()) return

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

  // Initial sync when authenticated and periodic sync (only if cloud sync is enabled)
  useEffect(() => {
    if (!isSignedIn || !cloudSyncEnabled) {
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

    // Use smart sync at regular intervals to reduce bandwidth
    const interval = setInterval(() => {
      smartSyncFromCloud()
    }, CLOUD_SYNC.SYNC_INTERVAL)

    return () => clearInterval(interval)
  }, [isSignedIn, cloudSyncEnabled, syncFromCloud, smartSyncFromCloud])

  // Listen for settings changes and sync to cloud
  useEffect(() => {
    if (!isSignedIn) return

    const handleSettingsChange = () => {
      // Immediately mark as pending to prevent cloud overwrites during debounce
      hasPendingChanges.current = true
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
    smartSyncFromCloud,
    syncToCloud,
    retryDecryption,
  }
}
