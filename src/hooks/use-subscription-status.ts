import { logError } from '@/utils/error-handling'
import { useAuth } from '@clerk/nextjs'
import { useEffect, useRef, useState } from 'react'

const SUBSCRIPTION_CACHE_KEY = 'cached_subscription_status'

interface CachedSubscription {
  is_subscribed: boolean
  chat_subscription_active: boolean
  api_subscription_active: boolean
}

export function useSubscriptionStatus() {
  const { getToken, isSignedIn, isLoaded } = useAuth()

  // Initialize with cached value if available
  const getCachedStatus = () => {
    if (typeof window === 'undefined') return null
    try {
      const cached = localStorage.getItem(SUBSCRIPTION_CACHE_KEY)
      if (cached) {
        return JSON.parse(cached) as CachedSubscription
      }
    } catch {
      // Ignore cache errors
    }
    return null
  }

  const cachedStatus = getCachedStatus()

  // Track if we initially had cached data
  const hadCachedDataRef = useRef(!!cachedStatus)

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
          // Only set loading to false if we didn't have cached data initially
          if (!hadCachedDataRef.current) {
            setIsLoading(false)
          }
          return
        }

        // Get authentication token
        // Prefer cookie-based auth for server routes; Clerk's server SDK
        // reads session from cookies. Only include Authorization if present.
        const token = await getToken().catch(() => null)
        const response = await fetch(`/api/billing/subscription-status`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          cache: 'no-store',
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
            localStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify(data))
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
        // Only set loading to false if we didn't have cached data initially
        // Otherwise, we're doing a background refresh and shouldn't show loading
        if (!hadCachedDataRef.current) {
          setIsLoading(false)
        }
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
