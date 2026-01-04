'use client'

import { ProjectProvider } from './project-provider'

interface ProjectChatWrapperProps {
  children: React.ReactNode
}

export function ProjectChatWrapper({ children }: ProjectChatWrapperProps) {
  return <ProjectProvider>{children}</ProjectProvider>
}
