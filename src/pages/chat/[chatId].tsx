'use client'

import { ChatInterface } from '@/components/chat'
import { ProjectProvider } from '@/components/project'
import { useRouter } from 'next/router'

export default function ChatPage() {
  const router = useRouter()
  const chatId =
    typeof router.query.chatId === 'string' ? router.query.chatId : null

  return (
    <div className="h-screen font-aeonik">
      <ProjectProvider>
        <ChatInterface initialChatId={chatId} />
      </ProjectProvider>
    </div>
  )
}
