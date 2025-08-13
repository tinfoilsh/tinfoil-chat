import { logError } from '@/utils/error-handling'
import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET() {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use currentUser() instead of clerkClient() for edge runtime compatibility
    const user = await currentUser()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const publicMetadata = user.publicMetadata

    // Check if subscription is active or canceled but not yet expired
    const tokenApiStatus =
      publicMetadata?.['token_based_api_subscription_status']
    const chatStatus = publicMetadata?.['chat_subscription_status']

    // For canceled subscriptions, check if they're still within the paid period
    const isChatStillActive = () => {
      if (chatStatus === 'active') return true
      if (chatStatus === 'canceled') {
        const expiresAt = publicMetadata?.['chat_subscription_expires_at'] as
          | string
          | undefined
        if (expiresAt) {
          // Check if expiration date is in the future
          return new Date(expiresAt) > new Date()
        }
      }
      return false
    }

    const isApiStillActive = () => {
      if (tokenApiStatus === 'active') return true
      if (tokenApiStatus === 'canceled') {
        // Assuming API subscription uses the same expiration field
        // Adjust if there's a separate field for API subscription expiration
        const expiresAt = (publicMetadata?.['api_subscription_expires_at'] ||
          publicMetadata?.['chat_subscription_expires_at']) as
          | string
          | undefined
        if (expiresAt) {
          return new Date(expiresAt) > new Date()
        }
      }
      return false
    }

    const response = {
      is_subscribed: isApiStillActive(),
      chat_subscription_active: isChatStillActive(),
      api_subscription_active: isApiStillActive(),
    }

    return NextResponse.json(response)
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
