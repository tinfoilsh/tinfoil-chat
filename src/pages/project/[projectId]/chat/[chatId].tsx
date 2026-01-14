'use client'

import { ChatInterface } from '@/components/chat'
import { ProjectProvider } from '@/components/project'
import { useRouter } from 'next/router'

export default function ProjectChatPage() {
  const router = useRouter()
  const projectId =
    typeof router.query.projectId === 'string' ? router.query.projectId : null
  const chatId =
    typeof router.query.chatId === 'string' ? router.query.chatId : null

  return (
    <div className="h-screen font-aeonik">
      <ProjectProvider initialProjectId={projectId}>
        <ChatInterface initialChatId={chatId} initialProjectId={projectId} />
      </ProjectProvider>
    </div>
  )
}
