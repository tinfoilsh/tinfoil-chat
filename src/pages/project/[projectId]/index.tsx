'use client'

import { ChatInterface } from '@/components/chat'
import { ProjectProvider } from '@/components/project'
import { useRouter } from 'next/router'

export default function ProjectPage() {
  const router = useRouter()
  const projectId =
    typeof router.query.projectId === 'string' ? router.query.projectId : null

  return (
    <div className="h-screen font-aeonik">
      <ProjectProvider initialProjectId={projectId}>
        <ChatInterface initialProjectId={projectId} />
      </ProjectProvider>
    </div>
  )
}
