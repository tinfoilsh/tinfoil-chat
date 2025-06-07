'use client'

import { ChatWrapper } from '@/components/chat/chat-wrapper'

export const dynamic = 'force-dynamic'

export default function Chat() {
  return (
    <div className="h-screen">
      <ChatWrapper />
    </div>
  )
}
