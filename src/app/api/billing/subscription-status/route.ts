import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { logError } from '@/utils/error-handling'

export const runtime = 'edge'

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const clerk = await clerkClient()
    const user = await clerk.users.getUser(userId)
    const publicMetadata = user.publicMetadata

    const response = {
      is_subscribed:
        publicMetadata?.['token_based_api_subscription_status'] === 'active',
      chat_subscription_active:
        publicMetadata?.['chat_subscription_status'] === 'active',
      api_subscription_active:
        publicMetadata?.['token_based_api_subscription_status'] === 'active',
    }

    return NextResponse.json(response)
  } catch (error) {
    logError('Failed to check subscription status', error, { 
      component: 'subscription-status-api'
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
