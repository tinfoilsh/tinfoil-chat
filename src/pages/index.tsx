'use client'

import { ChatInterface } from '@/components/chat'
import { ProjectProvider, ProjectSelectorView } from '@/components/project'
import { useEffect, useState } from 'react'

export default function Chat() {
  const [showProjectSelector, setShowProjectSelector] = useState(false)
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
        {showProjectSelector ? (
          <div className="flex h-full items-center justify-center bg-surface-chat-background">
            <div className="w-full max-w-4xl px-8">
              <ProjectSelectorView
                isDarkMode={isDarkMode}
                onBack={() => setShowProjectSelector(false)}
              />
            </div>
          </div>
        ) : (
          <ChatInterface onProjectsClick={() => setShowProjectSelector(true)} />
        )}
      </ProjectProvider>
    </div>
  )
}
