'use client'

import { ChatWrapper } from '@/components/chat/chat-wrapper'

// Force dynamic rendering to prevent static generation issues with Clerk
export const dynamic = 'force-dynamic'

export default function Chat() {
  return (
    <div className="h-screen">
      <ChatWrapper />
    </div>
  )
}
