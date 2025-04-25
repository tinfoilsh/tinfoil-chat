import { useEffect, useState } from 'react'

export function useSubscriptionStatus() {
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
        const response = await fetch('/api/billing/subscription-status')
        if (!response.ok) {
          throw new Error('Failed to fetch subscription status')
        }
        setSubscriptionStatus(await response.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchSubscriptionStatus()
  }, [])

  return {
    isLoading,
    error,
    ...subscriptionStatus,
  }
}
