import { logError, logInfo } from '@/utils/error-handling'
import { encryptionService } from '../encryption/encryption-service'

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.tinfoil.sh'

export interface ProfileData {
  // Theme settings
  isDarkMode?: boolean

  // Chat settings
  maxPromptMessages?: number
  language?: string

  // Personalization settings
  nickname?: string
  profession?: string
  traits?: string[]
  additionalContext?: string
  isUsingPersonalization?: boolean

  // Metadata
  version?: number
  updatedAt?: string
}

export class ProfileSyncService {
  private getToken: (() => Promise<string | null>) | null = null
  private cachedProfile: ProfileData | null = null
  private failedDecryptionData: string | null = null

  setTokenGetter(getToken: () => Promise<string | null>) {
    this.getToken = getToken
  }

  private async getHeaders(): Promise<HeadersInit> {
    if (!this.getToken) {
      throw new Error('Token getter not set')
    }

    const token = await this.getToken()
    if (!token) {
      throw new Error('Authentication token not set')
    }

    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  }

  async isAuthenticated(): Promise<boolean> {
    if (!this.getToken) return false
    const token = await this.getToken()
    return token !== null && token !== ''
  }

  // Get profile from cloud
  async fetchProfile(): Promise<ProfileData | null> {
    try {
      if (!(await this.isAuthenticated())) {
        logInfo('Skipping profile fetch - not authenticated', {
          component: 'ProfileSync',
          action: 'fetchProfile',
        })
        return null
      }

      logInfo('Fetching profile from cloud', {
        component: 'ProfileSync',
        action: 'fetchProfile',
      })

      const response = await fetch(`${API_BASE_URL}/api/profile/`, {
        headers: await this.getHeaders(),
      })

      if (response.status === 404) {
        logInfo('No profile exists in cloud yet', {
          component: 'ProfileSync',
          action: 'fetchProfile',
        })
        return null
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch profile: ${response.statusText}`)
      }

      const data = await response.json()

      logInfo('Profile data received from cloud', {
        component: 'ProfileSync',
        action: 'fetchProfile',
        metadata: {
          version: data.version,
          created: data.created,
          updated: data.updated,
          dataLength: data.data?.length || 0,
        },
      })

      // Initialize encryption service
      await encryptionService.initialize()

      // Try to decrypt the profile data
      try {
        // Backend now returns data wrapped in JSON like { data: "...", version: "..." }
        const encrypted = JSON.parse(data.data)

        logInfo('Parsed encrypted profile data', {
          component: 'ProfileSync',
          action: 'fetchProfile',
          metadata: {
            hasIv: !!encrypted.iv,
            hasData: !!encrypted.data,
            ivLength: encrypted.iv?.length || 0,
            dataLength: encrypted.data?.length || 0,
          },
        })

        const decrypted = await encryptionService.decrypt(encrypted)

        // Cache the decrypted profile
        this.cachedProfile = decrypted
        this.failedDecryptionData = null

        logInfo('Profile fetched and decrypted successfully', {
          component: 'ProfileSync',
          action: 'fetchProfile',
          metadata: {
            version: data.version,
            hasNickname: !!decrypted.nickname,
            hasLanguage: !!decrypted.language,
            hasPersonalization: !!decrypted.isUsingPersonalization,
          },
        })

        return decrypted
      } catch (decryptError) {
        // Failed to decrypt - store for later retry
        this.failedDecryptionData = data.data
        this.cachedProfile = null

        logInfo('Profile decryption failed, stored for retry', {
          component: 'ProfileSync',
          action: 'fetchProfile',
          metadata: {
            error:
              decryptError instanceof Error
                ? decryptError.message
                : 'Unknown error',
          },
        })

        return null
      }
    } catch (error) {
      // Silently fail if no auth token
      if (
        error instanceof Error &&
        error.message.includes('Authentication token not set')
      ) {
        logInfo('Profile fetch skipped - no auth token', {
          component: 'ProfileSync',
          action: 'fetchProfile',
        })
        return null
      }

      logError('Failed to fetch profile', error, {
        component: 'ProfileSync',
        action: 'fetchProfile',
      })

      return null
    }
  }

  // Save profile to cloud
  async saveProfile(
    profile: ProfileData,
  ): Promise<{ success: boolean; version?: number }> {
    try {
      if (!(await this.isAuthenticated())) {
        logInfo('Skipping profile save - not authenticated', {
          component: 'ProfileSync',
          action: 'saveProfile',
        })
        return { success: false }
      }

      logInfo('Saving profile to cloud', {
        component: 'ProfileSync',
        action: 'saveProfile',
        metadata: {
          hasNickname: !!profile.nickname,
          hasLanguage: !!profile.language,
          hasPersonalization: !!profile.isUsingPersonalization,
        },
      })

      // Initialize encryption service
      await encryptionService.initialize()

      // Add metadata
      const profileWithMetadata: ProfileData = {
        ...profile,
        updatedAt: new Date().toISOString(),
        version: (profile.version || 0) + 1,
      }

      // Encrypt the profile data
      const encrypted = await encryptionService.encrypt(profileWithMetadata)

      logInfo('Encrypted profile data', {
        component: 'ProfileSync',
        action: 'saveProfile',
        metadata: {
          hasIv: !!encrypted.iv,
          hasData: !!encrypted.data,
          ivLength: encrypted.iv?.length || 0,
          dataLength: encrypted.data?.length || 0,
          stringifiedLength: JSON.stringify(encrypted).length,
        },
      })

      const response = await fetch(`${API_BASE_URL}/api/profile/`, {
        method: 'PUT',
        headers: await this.getHeaders(),
        body: JSON.stringify({
          data: JSON.stringify(encrypted),
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to save profile: ${response.statusText}`)
      }

      // Update cache
      this.cachedProfile = profileWithMetadata

      logInfo('Profile saved successfully', {
        component: 'ProfileSync',
        action: 'saveProfile',
        metadata: {
          version: profileWithMetadata.version,
          size: JSON.stringify(encrypted).length,
        },
      })

      return { success: true, version: profileWithMetadata.version }
    } catch (error) {
      // Silently fail if no auth token
      if (
        error instanceof Error &&
        error.message.includes('Authentication token not set')
      ) {
        logInfo('Profile save skipped - no auth token', {
          component: 'ProfileSync',
          action: 'saveProfile',
        })
        return { success: false }
      }

      logError('Failed to save profile', error, {
        component: 'ProfileSync',
        action: 'saveProfile',
      })

      return { success: false }
    }
  }

  // Retry decryption with new key
  async retryDecryptionWithNewKey(): Promise<ProfileData | null> {
    if (!this.failedDecryptionData) {
      return null
    }

    try {
      await encryptionService.initialize()
      const encrypted = JSON.parse(this.failedDecryptionData)
      const decrypted = await encryptionService.decrypt(encrypted)

      // Cache the successfully decrypted profile
      this.cachedProfile = decrypted
      this.failedDecryptionData = null

      logInfo('Profile decrypted successfully with new key', {
        component: 'ProfileSync',
        action: 'retryDecryptionWithNewKey',
      })

      return decrypted
    } catch (error) {
      logInfo('Profile decryption with new key failed', {
        component: 'ProfileSync',
        action: 'retryDecryptionWithNewKey',
      })

      return null
    }
  }

  // Get cached profile (for quick access)
  getCachedProfile(): ProfileData | null {
    return this.cachedProfile
  }

  // Clear cache
  clearCache(): void {
    this.cachedProfile = null
    this.failedDecryptionData = null
  }
}

export const profileSync = new ProfileSyncService()
