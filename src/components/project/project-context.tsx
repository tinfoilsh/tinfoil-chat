'use client'

import type {
  CreateProjectData,
  Project,
  ProjectContextUsage,
  ProjectDocument,
  UpdateProjectData,
} from '@/types/project'
import { createContext, useContext } from 'react'

export interface ProjectContextValue {
  activeProject: Project | null
  isProjectMode: boolean
  projectDocuments: ProjectDocument[]
  loading: boolean
  error: string | null

  enterProjectMode: (projectId: string) => Promise<void>
  exitProjectMode: () => void
  createProject: (data: CreateProjectData) => Promise<Project>
  updateProject: (id: string, data: UpdateProjectData) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  uploadDocument: (file: File, content: string) => Promise<ProjectDocument>
  removeDocument: (docId: string) => Promise<void>
  refreshDocuments: () => Promise<void>
  updateProjectSummary: (summary: string) => Promise<void>

  getProjectSystemPrompt: () => string
  getContextUsage: (modelContextLimit: number) => ProjectContextUsage
}

const defaultContextValue: ProjectContextValue = {
  activeProject: null,
  isProjectMode: false,
  projectDocuments: [],
  loading: false,
  error: null,

  enterProjectMode: async () => {},
  exitProjectMode: () => {},
  createProject: async () => {
    throw new Error('ProjectProvider not mounted')
  },
  updateProject: async () => {},
  deleteProject: async () => {},
  uploadDocument: async () => {
    throw new Error('ProjectProvider not mounted')
  },
  removeDocument: async () => {},
  refreshDocuments: async () => {},
  updateProjectSummary: async () => {},

  getProjectSystemPrompt: () => '',
  getContextUsage: () => ({
    systemInstructions: 0,
    documents: [],
    summary: 0,
    totalUsed: 0,
    modelLimit: 0,
    availableForChat: 0,
  }),
}

export const ProjectContext =
  createContext<ProjectContextValue>(defaultContextValue)

export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext)
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider')
  }
  return context
}

export function estimateTokenCount(text: string | undefined): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

export function buildProjectContext(
  project: Project,
  documents: ProjectDocument[],
): string {
  let context = `## Project: ${project.name}\n`

  if (project.description) {
    context += `\n${project.description}\n`
  }

  if (project.systemInstructions) {
    context += `\n### Instructions\n${project.systemInstructions}\n`
  }

  if (documents.length > 0) {
    context += `\n### Documents\n`
    for (const doc of documents) {
      if (doc.content) {
        context += `--- ${doc.filename} ---\n${doc.content}\n\n`
      }
    }
  }

  if (project.summary) {
    context += `\n### Project Context (from previous conversations)\n${project.summary}\n`
  }

  return context
}
