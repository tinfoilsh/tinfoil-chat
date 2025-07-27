import { cloudSync } from '@/services/cloud/cloud-sync'
import { encryptionService } from '@/services/encryption/encryption-service'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'

export interface CloudSyncState {
  syncing: boolean
  lastSyncTime: number | null
  encryptionKey: string | null
}

export function useCloudSync() {
  const { getToken, isSignedIn } = useAuth()
  const [state, setState] = useState<CloudSyncState>({
    syncing: false,
    lastSyncTime: null,
    encryptionKey: null,
  })

  // Initialize cloud sync when user is signed in
  useEffect(() => {
    const initializeSync = async () => {
      if (!isSignedIn) return

      try {
        // Get auth token
        const token = await getToken()
        if (!token) return

        // Set auth token for cloud sync
        cloudSync.setAuthToken(token)

        // Initialize encryption
        const key = await encryptionService.initialize()

        setState((prev) => ({
          ...prev,
          encryptionKey: key,
        }))
      } catch (error) {
        console.error('Failed to initialize cloud sync:', error)
      }
    }

    initializeSync()
  }, [isSignedIn, getToken])

  // Sync chats
  const syncChats = useCallback(async () => {
    if (state.syncing) return

    setState((prev) => ({ ...prev, syncing: true }))

    try {
      const result = await cloudSync.syncAllChats()

      setState((prev) => ({
        ...prev,
        syncing: false,
        lastSyncTime: Date.now(),
      }))

      return result
    } catch (error) {
      setState((prev) => ({ ...prev, syncing: false }))
      throw error
    }
  }, [state.syncing])

  // Backup a single chat
  const backupChat = useCallback(async (chatId: string) => {
    await cloudSync.backupChat(chatId)
  }, [])

  // Set encryption key (for syncing across devices)
  const setEncryptionKey = useCallback(async (key: string) => {
    try {
      await encryptionService.setKey(key)
      setState((prev) => ({ ...prev, encryptionKey: key }))
    } catch (error) {
      throw new Error('Invalid encryption key')
    }
  }, [])

  return {
    ...state,
    syncChats,
    backupChat,
    setEncryptionKey,
  }
}
