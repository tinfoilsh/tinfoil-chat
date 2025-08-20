'use client'

// Inherit nodejs runtime from layout; no override here

import { ChatInterface } from '@/components/chat'

export default function Chat() {
  return (
    <div className="h-screen">
      <ChatInterface />
    </div>
  )
}
