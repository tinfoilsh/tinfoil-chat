import { SETTINGS_CACHED_SUBSCRIPTION_STATUS } from '@/constants/storage-keys'
import { useUser } from '@clerk/nextjs'
import { useEffect, useMemo } from 'react'

type StripeSubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'past_due'
  | 'paused'
  | 'trialing'
  | 'unpaid'

const SUPPORTED_STATUSES = new Set<StripeSubscriptionStatus>([
  'active',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'past_due',
  'paused',
  'trialing',
  'unpaid',
])

const isValidStatus = (status: unknown): status is StripeSubscriptionStatus =>
  typeof status === 'string' &&
  SUPPORTED_STATUSES.has(status as StripeSubscriptionStatus)

const parseExpiration = (expiration: unknown): Date | null => {
  if (typeof expiration !== 'string' || expiration.trim().length === 0) {
    return null
  }

  const parsed = new Date(expiration)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed
}

const hasActiveSubscription = (
  status: StripeSubscriptionStatus | null,
  expiration: Date | null,
  now: Date,
) => {
  if (!status) {
    return false
  }

  if (status === 'active' || status === 'trialing') {
    return true
  }

  if (status === 'canceled' && expiration) {
    return expiration.getTime() > now.getTime()
  }

  return false
}

/**
 * Hook to get subscription status from Clerk user's public metadata.
 * This is a fully client-side implementation that reads from useUser().
 */
export function useSubscriptionStatus() {
  const { user, isLoaded } = useUser()

  const subscriptionStatus = useMemo(() => {
    if (!isLoaded || !user) {
      return { chat_subscription_active: false }
    }

    const publicMetadata = (user.publicMetadata ?? {}) as Record<
      string,
      unknown
    >

    const rawChatStatus = publicMetadata['chat_subscription_status']
    const chatStatus = isValidStatus(rawChatStatus) ? rawChatStatus : null

    const chatExpiration = parseExpiration(
      publicMetadata['chat_subscription_expires_at'],
    )

    const now = new Date()
    const chatActive = hasActiveSubscription(chatStatus, chatExpiration, now)

    return { chat_subscription_active: chatActive }
  }, [user, isLoaded])

  // Persist subscription status so next page load can use it immediately
  useEffect(() => {
    if (!isLoaded) return
    try {
      if (!user) {
        localStorage.removeItem(SETTINGS_CACHED_SUBSCRIPTION_STATUS)
        return
      }
      localStorage.setItem(
        SETTINGS_CACHED_SUBSCRIPTION_STATUS,
        JSON.stringify(subscriptionStatus),
      )
    } catch {
      // best-effort
    }
  }, [isLoaded, user, subscriptionStatus])

  return {
    isLoading: !isLoaded,
    error: null,
    ...subscriptionStatus,
  }
}
