'use client'

import { ChatInterface } from '@/components/chat'

export const dynamic = 'force-dynamic'

export default function Chat() {
  return (
    <div className="h-screen">
      <ChatInterface />
    </div>
  )
}
