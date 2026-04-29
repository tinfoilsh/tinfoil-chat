'use client'

import { ChatInterface } from '@/components/chat'
import { ProjectProvider } from '@/components/project'

/**
 * Entry point for starting a new chat without any auto-opening intro/setup
 * modals. Pairs nicely with the `?q=` query parameter to send a prefilled
 * message immediately (e.g. /newchat?q=hello+world).
 */
export default function NewChatPage() {
  return (
    <div className="h-screen font-aeonik">
      <ProjectProvider>
        <ChatInterface suppressIntroModals />
      </ProjectProvider>
    </div>
  )
}
