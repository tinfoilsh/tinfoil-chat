'use client'

export const runtime = 'edge'

import { ChatInterface } from '@/components/chat'

export default function Chat() {
  return (
    <div className="h-screen">
      <ChatInterface />
    </div>
  )
}
