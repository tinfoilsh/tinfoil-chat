'use client'

import { UI_EXPAND_PROJECTS_ON_MOUNT } from '@/constants/storage-keys'
import { useMemory } from '@/hooks/use-memory'
import { projectStorage } from '@/services/cloud/project-storage'
import { projectEvents } from '@/services/project/project-events'
import type { Fact, MemoryState } from '@/types/memory'
import type {
  CreateProjectData,
  Project,
  ProjectContextUsage,
  ProjectDocument,
  UpdateProjectData,
} from '@/types/project'
import { logError, logInfo } from '@/utils/error-handling'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildProjectContext,
  estimateTokenCount,
  type LoadingProject,
  ProjectContext,
  type ProjectContextValue,
  type UploadingFile,
} from './project-context'
import { hydrateProjectDocuments } from './project-document-hydration'

interface ProjectProviderProps {
  children: React.ReactNode
  initialProjectId?: string | null
}

export function ProjectProvider({
  children,
  initialProjectId,
}: ProjectProviderProps) {
  const { isSignedIn } = useAuth()
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [projectDocuments, setProjectDocuments] = useState<ProjectDocument[]>(
    [],
  )
  const [loading, setLoading] = useState(false)
  const [loadingProject, setLoadingProject] = useState<LoadingProject | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])
  const initializingRef = useRef(false)
  const initialProjectLoadedRef = useRef(false)
  const pendingProjectIdRef = useRef<string | null>(null)
  const committedProjectIdRef = useRef<string | null>(null)
  const projectLoadGenerationRef = useRef(0)
  const documentRefreshGenerationRef = useRef(0)
  const documentMutationGenerationRef = useRef(0)

  const isProjectMode = activeProject !== null

  useEffect(() => {
    if (isSignedIn && !initializingRef.current) {
      initializingRef.current = true
    } else if (!isSignedIn) {
      projectLoadGenerationRef.current += 1
      documentRefreshGenerationRef.current += 1
      documentMutationGenerationRef.current += 1
      pendingProjectIdRef.current = null
      committedProjectIdRef.current = null
      initializingRef.current = false
      initialProjectLoadedRef.current = false
      // Clear all user-specific state on logout to prevent data leaking across sessions
      setActiveProject(null)
      setProjectDocuments([])
      setError(null)
      setLoading(false)
      setLoadingProject(null)
    }
  }, [isSignedIn])

  // Memory callbacks for useMemory hook
  const memoryCallbacks = useMemo(
    () => ({
      onSave: async (memory: MemoryState) => {
        if (!activeProject) return
        await projectStorage.updateProject(activeProject.id, {
          memory: memory.facts,
        })
        setActiveProject((prev) =>
          prev && prev.id === activeProject.id
            ? {
                ...prev,
                memory: memory.facts,
                updatedAt: new Date().toISOString(),
              }
            : prev,
        )
      },
      onLoad: async (): Promise<MemoryState> => {
        return {
          facts: activeProject?.memory || [],
          lastProcessedTimestamp: null,
        }
      },
    }),
    [activeProject],
  )

  const { processMessages, loadMemory } = useMemory({
    callbacks: memoryCallbacks,
    enabled: !!activeProject,
  })

  // Load memory when project changes
  const activeProjectId = activeProject?.id
  useEffect(() => {
    if (activeProjectId) {
      loadMemory()
    }
  }, [activeProjectId, loadMemory])

  // Listen for memory update events
  useEffect(() => {
    if (!activeProject) return

    const unsubscribe = projectEvents.on(
      'memory-update-needed',
      async (event) => {
        if (event.projectId !== activeProject.id) return

        logInfo('Processing memory update event', {
          component: 'ProjectProvider',
          action: 'memoryUpdateEvent',
          metadata: { projectId: event.projectId },
        })

        await processMessages(event.messages)
      },
    )

    return unsubscribe
  }, [activeProject, processMessages])

  const enterProjectMode = useCallback(
    async (projectId: string, projectName?: string): Promise<boolean> => {
      const generation = projectLoadGenerationRef.current + 1
      projectLoadGenerationRef.current = generation
      documentRefreshGenerationRef.current += 1
      pendingProjectIdRef.current = projectId
      setLoading(true)
      setError(null)
      setUploadingFiles([])
      setLoadingProject({ id: projectId, name: projectName || 'Loading...' })

      try {
        const project = await projectStorage.getProject(projectId)
        if (!project) {
          throw new Error('Project not found')
        }

        const documentsResponse = await projectStorage.listDocuments(projectId)

        const fullById = await projectStorage.getDocuments(
          projectId,
          documentsResponse.documents.map((doc) => doc.id),
        )

        const documents = hydrateProjectDocuments(
          documentsResponse.documents,
          fullById,
        )

        if (
          projectLoadGenerationRef.current !== generation ||
          pendingProjectIdRef.current !== projectId
        ) {
          return false
        }

        committedProjectIdRef.current = projectId
        setActiveProject(project)
        setProjectDocuments(documents)

        logInfo('Entered project mode', {
          component: 'ProjectProvider',
          action: 'enterProjectMode',
          metadata: { projectId, documentCount: documents.length },
        })
        return true
      } catch (err) {
        if (projectLoadGenerationRef.current !== generation) return false
        pendingProjectIdRef.current = committedProjectIdRef.current
        const message =
          err instanceof Error ? err.message : 'Failed to load project'
        setError(message)
        logError('Failed to enter project mode', err, {
          component: 'ProjectProvider',
          action: 'enterProjectMode',
          metadata: { projectId },
        })
        return false
      } finally {
        if (projectLoadGenerationRef.current === generation) {
          setLoading(false)
          setLoadingProject(null)
        }
      }
    },
    [],
  )

  // Load initial project from URL if provided
  useEffect(() => {
    if (
      initialProjectId &&
      isSignedIn &&
      !initialProjectLoadedRef.current &&
      !activeProject
    ) {
      initialProjectLoadedRef.current = true
      enterProjectMode(initialProjectId).then((success) => {
        if (!success) {
          initialProjectLoadedRef.current = false
        }
      })
    }
  }, [initialProjectId, isSignedIn, activeProject, enterProjectMode])

  const exitProjectMode = useCallback(() => {
    projectLoadGenerationRef.current += 1
    documentRefreshGenerationRef.current += 1
    documentMutationGenerationRef.current += 1
    pendingProjectIdRef.current = null
    committedProjectIdRef.current = null
    setActiveProject(null)
    setProjectDocuments([])
    setUploadingFiles([])
    setError(null)

    // Signal to ChatSidebar that projects should be expanded
    sessionStorage.setItem(UI_EXPAND_PROJECTS_ON_MOUNT, 'true')

    logInfo('Exited project mode', {
      component: 'ProjectProvider',
      action: 'exitProjectMode',
    })
  }, [])

  const createProject = useCallback(
    async (data: CreateProjectData): Promise<Project> => {
      setLoading(true)
      setError(null)

      try {
        const project = await projectStorage.createProject(data)

        logInfo('Created project', {
          component: 'ProjectProvider',
          action: 'createProject',
          metadata: { projectId: project.id, name: data.name },
        })

        return project
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to create project'
        setError(message)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const updateProject = useCallback(
    async (id: string, data: UpdateProjectData) => {
      setError(null)

      try {
        await projectStorage.updateProject(id, data)

        setActiveProject((prev) =>
          prev && prev.id === id
            ? {
                ...prev,
                name: data.name ?? prev.name,
                description: data.description ?? prev.description,
                systemInstructions:
                  data.systemInstructions ?? prev.systemInstructions,
                color: data.color ?? prev.color,
                memory: data.memory ?? prev.memory,
                updatedAt: new Date().toISOString(),
              }
            : prev,
        )

        logInfo('Updated project', {
          component: 'ProjectProvider',
          action: 'updateProject',
          metadata: { projectId: id },
        })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to update project'
        setError(message)
        throw err
      }
    },
    [],
  )

  const deleteProject = useCallback(
    async (id: string) => {
      setError(null)

      try {
        await projectStorage.deleteProject(id)

        if (activeProject && activeProject.id === id) {
          exitProjectMode()
        }

        logInfo('Deleted project', {
          component: 'ProjectProvider',
          action: 'deleteProject',
          metadata: { projectId: id },
        })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to delete project'
        setError(message)
        throw err
      }
    },
    [activeProject, exitProjectMode],
  )

  const uploadDocument = useCallback(
    async (file: File, content: string): Promise<ProjectDocument> => {
      if (!activeProject) {
        throw new Error('No active project')
      }

      const projectId = activeProject.id
      documentRefreshGenerationRef.current += 1
      setError(null)

      try {
        const document = await projectStorage.uploadDocument(
          projectId,
          file.name,
          file.type || 'text/plain',
          content,
          file.size,
        )

        documentMutationGenerationRef.current += 1
        if (committedProjectIdRef.current === projectId) {
          setProjectDocuments((prev) => [
            ...prev.filter((existing) => existing.id !== document.id),
            document,
          ])
        }

        logInfo('Uploaded document', {
          component: 'ProjectProvider',
          action: 'uploadDocument',
          metadata: {
            projectId,
            documentId: document.id,
            filename: file.name,
          },
        })

        return document
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to upload document'
        setError(message)
        throw err
      }
    },
    [activeProject],
  )

  const removeDocument = useCallback(
    async (docId: string) => {
      if (!activeProject) {
        throw new Error('No active project')
      }

      const projectId = activeProject.id
      documentRefreshGenerationRef.current += 1
      setError(null)

      const removedDoc = projectDocuments.find((doc) => doc.id === docId)

      setProjectDocuments((prev) => prev.filter((doc) => doc.id !== docId))

      try {
        await projectStorage.deleteDocument(projectId, docId)
        documentMutationGenerationRef.current += 1
        if (committedProjectIdRef.current === projectId) {
          setProjectDocuments((prev) =>
            prev.filter((document) => document.id !== docId),
          )
        }

        logInfo('Removed document', {
          component: 'ProjectProvider',
          action: 'removeDocument',
          metadata: { projectId, documentId: docId },
        })
      } catch (err) {
        documentMutationGenerationRef.current += 1
        if (removedDoc && committedProjectIdRef.current === projectId) {
          setProjectDocuments((prev) =>
            prev.some((document) => document.id === removedDoc.id)
              ? prev
              : [...prev, removedDoc],
          )
        }

        const message =
          err instanceof Error ? err.message : 'Failed to remove document'
        setError(message)
        throw err
      }
    },
    [activeProject, projectDocuments],
  )

  const refreshDocuments = useCallback(async () => {
    if (!activeProject) return
    const projectId = activeProject.id
    const generation = documentRefreshGenerationRef.current + 1
    documentRefreshGenerationRef.current = generation
    const mutationGeneration = documentMutationGenerationRef.current

    try {
      const documentsResponse = await projectStorage.listDocuments(projectId)

      const fullById = await projectStorage.getDocuments(
        projectId,
        documentsResponse.documents.map((doc) => doc.id),
      )

      if (
        documentRefreshGenerationRef.current !== generation ||
        documentMutationGenerationRef.current !== mutationGeneration ||
        committedProjectIdRef.current !== projectId
      ) {
        return
      }

      setProjectDocuments((previous) =>
        hydrateProjectDocuments(
          documentsResponse.documents,
          fullById,
          previous,
        ),
      )
    } catch (err) {
      if (documentRefreshGenerationRef.current !== generation) return
      logError('Failed to refresh documents', err, {
        component: 'ProjectProvider',
        action: 'refreshDocuments',
        metadata: { projectId },
      })
    }
  }, [activeProject])

  const updateProjectMemory = useCallback(
    async (memory: Fact[]) => {
      if (!activeProject) return

      await updateProject(activeProject.id, { memory })
    },
    [activeProject, updateProject],
  )

  const addUploadingFile = useCallback((file: UploadingFile) => {
    setUploadingFiles((prev) => [...prev, file])
  }, [])

  const removeUploadingFile = useCallback((id: string) => {
    setUploadingFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const getProjectSystemPrompt = useCallback((): string => {
    if (!activeProject) return ''
    return buildProjectContext(activeProject, projectDocuments)
  }, [activeProject, projectDocuments])

  const getContextUsage = useCallback(
    (modelContextLimit: number): ProjectContextUsage => {
      if (!activeProject) {
        return {
          systemInstructions: 0,
          documents: [],
          memory: 0,
          totalUsed: 0,
          modelLimit: modelContextLimit,
          availableForChat: modelContextLimit,
        }
      }

      const instructionsTokens = estimateTokenCount(
        activeProject.systemInstructions,
      )
      const memoryText = activeProject.memory
        ?.map((f) => `${f.category}: ${f.fact}`)
        .join('\n')
      const memoryTokens = estimateTokenCount(memoryText)

      const documentTokens = projectDocuments.map((doc) => ({
        filename: doc.filename,
        tokens: estimateTokenCount(doc.content),
      }))

      const totalDocumentTokens = documentTokens.reduce(
        (sum, d) => sum + d.tokens,
        0,
      )
      const totalUsed = instructionsTokens + totalDocumentTokens + memoryTokens

      return {
        systemInstructions: instructionsTokens,
        documents: documentTokens,
        memory: memoryTokens,
        totalUsed,
        modelLimit: modelContextLimit,
        availableForChat: Math.max(0, modelContextLimit - totalUsed),
      }
    },
    [activeProject, projectDocuments],
  )

  const contextValue: ProjectContextValue = useMemo(
    () => ({
      activeProject,
      isProjectMode,
      projectDocuments,
      loading,
      loadingProject,
      error,
      uploadingFiles,
      enterProjectMode,
      exitProjectMode,
      createProject,
      updateProject,
      deleteProject,
      uploadDocument,
      removeDocument,
      refreshDocuments,
      updateProjectMemory,
      addUploadingFile,
      removeUploadingFile,
      getProjectSystemPrompt,
      getContextUsage,
    }),
    [
      activeProject,
      isProjectMode,
      projectDocuments,
      loading,
      loadingProject,
      error,
      uploadingFiles,
      enterProjectMode,
      exitProjectMode,
      createProject,
      updateProject,
      deleteProject,
      uploadDocument,
      removeDocument,
      refreshDocuments,
      updateProjectMemory,
      addUploadingFile,
      removeUploadingFile,
      getProjectSystemPrompt,
      getContextUsage,
    ],
  )

  return (
    <ProjectContext.Provider value={contextValue}>
      {children}
    </ProjectContext.Provider>
  )
}
