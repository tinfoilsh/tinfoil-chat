import { API_BASE_URL } from '@/config'
import { logError } from '@/utils/error-handling'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useState } from 'react'

export function useApiKey() {
  const [apiKey, setApiKey] = useState<string | null>(null)
  const { getToken } = useAuth()

  const getApiKey = useCallback(async () => {
    // If we already have the API key in state, return it
    if (apiKey) {
      return apiKey
    }

    try {
      // Get auth token from Clerk
      const token = await getToken()
      // Return empty string if no token (user not logged in)
      if (!token) {
        return ''
      }

      // Fetch API key from the server
      const response = await fetch(`${API_BASE_URL}/api/keys/chat`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to get API key: ${response.status}`)
      }

      const data = await response.json()
      setApiKey(data.key)
      return data.key
    } catch (error) {
      logError('Failed to fetch API key', error, {
        component: 'useApiKey',
      })
      return ''
    }
  }, [apiKey, getToken])

  return {
    apiKey,
    getApiKey,
  }
}
