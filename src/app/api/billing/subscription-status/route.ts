import { NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET() {
  return NextResponse.json({
    is_subscribed: true,
    chat_subscription_active: true,
    api_subscription_active: true,
  })
}
