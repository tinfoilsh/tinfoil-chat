'use client'

import type { Fact } from '@/types/memory'
import type {
  CreateProjectData,
  Project,
  ProjectContextUsage,
  ProjectDocument,
  UpdateProjectData,
} from '@/types/project'
import { createContext, useContext } from 'react'

export interface LoadingProject {
  id: string
  name: string
}

export interface ProjectContextValue {
  activeProject: Project | null
  isProjectMode: boolean
  projectDocuments: ProjectDocument[]
  loading: boolean
  loadingProject: LoadingProject | null
  error: string | null

  enterProjectMode: (projectId: string, projectName?: string) => Promise<void>
  exitProjectMode: () => void
  createProject: (data: CreateProjectData) => Promise<Project>
  updateProject: (id: string, data: UpdateProjectData) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  uploadDocument: (file: File, content: string) => Promise<ProjectDocument>
  removeDocument: (docId: string) => Promise<void>
  refreshDocuments: () => Promise<void>
  updateProjectMemory: (memory: Fact[]) => Promise<void>

  getProjectSystemPrompt: () => string
  getContextUsage: (modelContextLimit: number) => ProjectContextUsage
}

export const ProjectContext = createContext<ProjectContextValue | null>(null)

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

  if (project.memory && project.memory.length > 0) {
    context += `\n### User Memory (from previous conversations)\n`
    context += formatMemoryFacts(project.memory)
  }

  return context
}

function formatMemoryFacts(facts: Fact[]): string {
  const byCategory = facts.reduce(
    (acc, fact) => {
      if (!acc[fact.category]) acc[fact.category] = []
      acc[fact.category].push(fact)
      return acc
    },
    {} as Record<string, Fact[]>,
  )

  let output = ''
  for (const [category, categoryFacts] of Object.entries(byCategory)) {
    output += `**${category}**\n`
    for (const fact of categoryFacts) {
      output += `- ${fact.fact}\n`
    }
    output += '\n'
  }
  return output.trim()
}
