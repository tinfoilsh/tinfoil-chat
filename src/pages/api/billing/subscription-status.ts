import { logError } from '@/utils/error-handling'
import { clerkClient, getAuth } from '@clerk/nextjs/server'
import type { NextApiRequest, NextApiResponse } from 'next'

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { userId } = getAuth(req)

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const client = await clerkClient()
    const user = await client.users.getUser(userId)

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
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

    return res.status(200).json({
      chat_subscription_active: chatActive,
    })
  } catch (error) {
    logError('Failed to check subscription status', error, {
      component: 'subscription-status-api',
    })
    return res.status(500).json({ error: 'Internal server error' })
  }
}
