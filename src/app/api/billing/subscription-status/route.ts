import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const clerk = await clerkClient()
    const user = await clerk.users.getUser(userId)
    const publicMetadata = user.publicMetadata

    return NextResponse.json({
      is_subscribed:
        publicMetadata?.['token_based_api_subscription_status'] === 'active',
      chat_subscription_active:
        publicMetadata?.['chat_subscription_status'] === 'active',
      api_subscription_active:
        publicMetadata?.['token_based_api_subscription_status'] === 'active',
    })
  } catch (error) {
    console.error('Error checking subscription status:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
