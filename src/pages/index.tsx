'use client'

import { ChatInterface } from '@/components/chat'
import {
  ProjectDetailView,
  ProjectProvider,
  ProjectSelectorView,
  useProject,
} from '@/components/project'
import type { Project } from '@/types/project'
import { useCallback, useEffect, useState } from 'react'

type ProjectView = 'chat' | 'list' | 'detail'

function ProjectViewRouter({ isDarkMode }: { isDarkMode: boolean }) {
  const { enterProjectMode } = useProject()
  const [view, setView] = useState<ProjectView>('chat')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)

  const handleSelectProject = useCallback(
    async (project: Project) => {
      setSelectedProject(project)
      await enterProjectMode(project.id)
      setView('detail')
    },
    [enterProjectMode],
  )

  const handleBackFromList = useCallback(() => {
    setView('chat')
  }, [])

  const handleBackFromDetail = useCallback(() => {
    setSelectedProject(null)
    setView('list')
  }, [])

  const handleStartChat = useCallback(() => {
    setView('chat')
  }, [])

  const handleProjectsClick = useCallback(() => {
    setView('list')
  }, [])

  if (view === 'detail' && selectedProject) {
    return (
      <div className="h-full bg-surface-chat-background">
        <ProjectDetailView
          project={selectedProject}
          isDarkMode={isDarkMode}
          onBack={handleBackFromDetail}
          onStartChat={handleStartChat}
        />
      </div>
    )
  }

  if (view === 'list') {
    return (
      <div className="flex h-full items-center justify-center bg-surface-chat-background">
        <div className="w-full max-w-4xl px-8">
          <ProjectSelectorView
            isDarkMode={isDarkMode}
            onBack={handleBackFromList}
            onSelectProject={handleSelectProject}
          />
        </div>
      </div>
    )
  }

  return <ChatInterface onProjectsClick={handleProjectsClick} />
}

export default function Chat() {
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme')
      const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches
      setIsDarkMode(savedTheme === 'dark' || (!savedTheme && prefersDark))

      const handleThemeChange = () => {
        const theme = document.documentElement.getAttribute('data-theme')
        setIsDarkMode(theme === 'dark')
      }

      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (
            mutation.type === 'attributes' &&
            mutation.attributeName === 'data-theme'
          ) {
            handleThemeChange()
          }
        })
      })

      observer.observe(document.documentElement, { attributes: true })

      return () => observer.disconnect()
    }
  }, [])

  return (
    <div className="h-screen font-aeonik">
      <ProjectProvider>
        <ProjectViewRouter isDarkMode={isDarkMode} />
      </ProjectProvider>
    </div>
  )
}
