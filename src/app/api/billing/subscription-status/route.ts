import { logError } from '@/utils/error-handling'
import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

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

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await currentUser()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
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

    return NextResponse.json({
      chat_subscription_active: chatActive,
    })
  } catch (error) {
    logError('Failed to check subscription status', error, {
      component: 'subscription-status-api',
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
