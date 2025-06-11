import { logError } from '@/utils/error-handling'
import { useAuth } from '@clerk/nextjs'
import { useEffect, useState } from 'react'

export function useSubscriptionStatus() {
  const { getToken, isSignedIn } = useAuth()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [subscriptionStatus, setSubscriptionStatus] = useState({
    is_subscribed: false,
    chat_subscription_active: false,
    api_subscription_active: false,
  })

  useEffect(() => {
    const fetchSubscriptionStatus = async () => {
      try {
        // Don't fetch if user is not signed in
        if (!isSignedIn) {
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
      } catch (err) {
        logError('Failed to fetch subscription status', err, {
          component: 'useSubscriptionStatus',
        })
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchSubscriptionStatus()
  }, [getToken, isSignedIn])

  return {
    isLoading,
    error,
    ...subscriptionStatus,
  }
}
