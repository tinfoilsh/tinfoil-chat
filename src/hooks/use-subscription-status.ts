import { logError } from '@/utils/error-handling'
import { useAuth } from '@clerk/nextjs'
import { useEffect, useState } from 'react'

const SUBSCRIPTION_CACHE_KEY = 'cached_subscription_status'
const SUBSCRIPTION_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

interface CachedSubscription {
  data: {
    is_subscribed: boolean
    chat_subscription_active: boolean
    api_subscription_active: boolean
  }
  timestamp: number
}

export function useSubscriptionStatus() {
  const { getToken, isSignedIn, isLoaded } = useAuth()

  // Initialize with cached value if available
  const getCachedStatus = () => {
    if (typeof window === 'undefined') return null
    try {
      const cached = localStorage.getItem(SUBSCRIPTION_CACHE_KEY)
      if (cached) {
        const parsed: CachedSubscription = JSON.parse(cached)
        // Check if cache is still valid
        if (Date.now() - parsed.timestamp < SUBSCRIPTION_CACHE_TTL) {
          return parsed.data
        }
      }
    } catch {
      // Ignore cache errors
    }
    return null
  }

  const cachedStatus = getCachedStatus()

  // Only show loading if we don't have cached data
  const [isLoading, setIsLoading] = useState(!cachedStatus)
  const [error, setError] = useState<string | null>(null)
  const [subscriptionStatus, setSubscriptionStatus] = useState(
    cachedStatus || {
      is_subscribed: false,
      chat_subscription_active: false,
      api_subscription_active: false,
    },
  )

  useEffect(() => {
    const fetchSubscriptionStatus = async () => {
      try {
        // Wait for auth to be loaded before proceeding
        if (!isLoaded) {
          return
        }

        // Don't fetch if user is not signed in
        if (!isSignedIn) {
          // Clear cache when signed out
          if (typeof window !== 'undefined') {
            try {
              localStorage.removeItem(SUBSCRIPTION_CACHE_KEY)
            } catch {
              // Ignore cache errors
            }
          }
          setIsLoading(false)
          return
        }

        // Get authentication token
        const token = await getToken()
        if (!token) {
          throw new Error('No authentication token available')
        }

        const response = await fetch(`/api/billing/subscription-status`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          throw new Error(
            `Failed to fetch subscription status: ${response.status}`,
          )
        }

        const data = await response.json()
        setSubscriptionStatus(data)

        // Cache the subscription status
        if (typeof window !== 'undefined') {
          try {
            const cacheData: CachedSubscription = {
              data,
              timestamp: Date.now(),
            }
            localStorage.setItem(
              SUBSCRIPTION_CACHE_KEY,
              JSON.stringify(cacheData),
            )
          } catch {
            // Ignore cache errors
          }
        }
      } catch (err) {
        logError('Failed to fetch subscription status', err, {
          component: 'useSubscriptionStatus',
        })
        setError(err instanceof Error ? err.message : 'An error occurred')

        // Clear cache on error
        if (typeof window !== 'undefined') {
          try {
            localStorage.removeItem(SUBSCRIPTION_CACHE_KEY)
          } catch {
            // Ignore cache errors
          }
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchSubscriptionStatus()
  }, [getToken, isSignedIn, isLoaded])

  return {
    isLoading,
    error,
    ...subscriptionStatus,
  }
}
