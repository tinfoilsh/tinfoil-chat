'use client'

import { ChatInterface } from '@/components/chat'
import { ProjectProvider, useProject } from '@/components/project'
import { useCallback } from 'react'

function ProjectViewRouter() {
  const { exitProjectMode } = useProject()

  const handleExitProject = useCallback(() => {
    exitProjectMode()
  }, [exitProjectMode])

  return <ChatInterface onExitProject={handleExitProject} />
}

export default function Chat() {
  return (
    <div className="h-screen font-aeonik">
      <ProjectProvider>
        <ProjectViewRouter />
      </ProjectProvider>
    </div>
  )
}
