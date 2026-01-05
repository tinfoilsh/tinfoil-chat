'use client'

import { ChatInterface } from '@/components/chat'
import {
  ProjectProvider,
  ProjectSelectorView,
  useProject,
} from '@/components/project'
import type { Project } from '@/types/project'
import { useCallback, useEffect, useState } from 'react'

type ProjectView = 'chat' | 'list'

function ProjectViewRouter({ isDarkMode }: { isDarkMode: boolean }) {
  const { enterProjectMode, exitProjectMode, isProjectMode } = useProject()
  const [view, setView] = useState<ProjectView>('chat')

  const handleSelectProject = useCallback(
    async (project: Project) => {
      await enterProjectMode(project.id)
      setView('chat')
    },
    [enterProjectMode],
  )

  const handleBackFromList = useCallback(() => {
    setView('chat')
  }, [])

  const handleExitProject = useCallback(() => {
    exitProjectMode()
    setView('list')
  }, [exitProjectMode])

  const handleProjectsClick = useCallback(() => {
    setView('list')
  }, [])

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

  return (
    <ChatInterface
      onProjectsClick={handleProjectsClick}
      onExitProject={handleExitProject}
    />
  )
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
