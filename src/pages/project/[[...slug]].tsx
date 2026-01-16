'use client'

import { ChatInterface } from '@/components/chat'
import { ProjectProvider } from '@/components/project'
import { useRouter } from 'next/router'

export default function ProjectCatchAllPage() {
  const router = useRouter()
  const slug = router.query.slug
  const parts =
    typeof slug === 'string' ? [slug] : Array.isArray(slug) ? slug : []

  const projectId = parts[0] ?? null
  const isProjectChat = parts[1] === 'chat'
  const chatId = isProjectChat ? (parts[2] ?? null) : null

  return (
    <div className="h-screen font-aeonik">
      <ProjectProvider
        initialProjectId={typeof projectId === 'string' ? projectId : null}
      >
        <ChatInterface
          initialProjectId={typeof projectId === 'string' ? projectId : null}
          initialChatId={typeof chatId === 'string' ? chatId : null}
        />
      </ProjectProvider>
    </div>
  )
}
