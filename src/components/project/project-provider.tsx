'use client'

import { projectStorage } from '@/services/cloud/project-storage'
import { encryptionService } from '@/services/encryption/encryption-service'
import { projectEvents } from '@/services/project/project-events'
import { updateProjectSummary as updateSummaryWithLLM } from '@/services/project/project-summary'
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
  ProjectContext,
  type ProjectContextValue,
} from './project-context'

interface ProjectProviderProps {
  children: React.ReactNode
}

export function ProjectProvider({ children }: ProjectProviderProps) {
  const { getToken, isSignedIn } = useAuth()
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [projectDocuments, setProjectDocuments] = useState<ProjectDocument[]>(
    [],
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initializingRef = useRef(false)

  const isProjectMode = activeProject !== null

  useEffect(() => {
    if (isSignedIn && getToken && !initializingRef.current) {
      initializingRef.current = true
      projectStorage.setTokenGetter(getToken)
    }
  }, [isSignedIn, getToken])

  useEffect(() => {
    if (!activeProject || !getToken) return

    const unsubscribe = projectEvents.on(
      'summary-update-needed',
      async (event) => {
        if (event.projectId !== activeProject.id) return

        logInfo('Processing summary update event', {
          component: 'ProjectProvider',
          action: 'summaryUpdateEvent',
          metadata: { projectId: event.projectId },
        })

        try {
          const newSummary = await updateSummaryWithLLM({
            currentSummary: activeProject.summary || '',
            userMessage: event.userMessage,
            assistantResponse: event.assistantResponse,
            getToken,
          })

          if (newSummary) {
            await projectStorage.updateProject(activeProject.id, {
              summary: newSummary,
            })
            setActiveProject((prev) =>
              prev
                ? {
                    ...prev,
                    summary: newSummary,
                    updatedAt: new Date().toISOString(),
                  }
                : null,
            )

            logInfo('Project summary updated successfully', {
              component: 'ProjectProvider',
              action: 'summaryUpdateComplete',
              metadata: {
                projectId: activeProject.id,
                summaryLength: newSummary.length,
              },
            })
          }
        } catch (error) {
          logError('Failed to update project summary', error, {
            component: 'ProjectProvider',
            action: 'summaryUpdateEvent',
            metadata: { projectId: event.projectId },
          })
        }
      },
    )

    return unsubscribe
  }, [activeProject, getToken])

  const enterProjectMode = useCallback(async (projectId: string) => {
    setLoading(true)
    setError(null)

    try {
      const project = await projectStorage.getProject(projectId)
      if (!project) {
        throw new Error('Project not found')
      }

      const documentsResponse = await projectStorage.listDocuments(projectId, {
        includeContent: true,
      })

      const documents: ProjectDocument[] = await Promise.all(
        documentsResponse.documents.map(async (doc) => {
          if (doc.content) {
            try {
              await encryptionService.initialize()
              const decrypted = (await encryptionService.decrypt(
                JSON.parse(doc.content),
              )) as { content: string; filename: string; contentType: string }
              return {
                ...doc,
                content: decrypted.content,
                filename: decrypted.filename,
                contentType: decrypted.contentType,
              }
            } catch (decryptError) {
              logError('Failed to decrypt document', decryptError, {
                component: 'ProjectProvider',
                action: 'enterProjectMode',
                metadata: { documentId: doc.id },
              })
              return {
                ...doc,
                content: undefined,
                filename: '',
                contentType: '',
              }
            }
          }
          return { ...doc, filename: '', contentType: '' }
        }),
      )

      setActiveProject(project)
      setProjectDocuments(documents)

      logInfo('Entered project mode', {
        component: 'ProjectProvider',
        action: 'enterProjectMode',
        metadata: { projectId, documentCount: documents.length },
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load project'
      setError(message)
      logError('Failed to enter project mode', err, {
        component: 'ProjectProvider',
        action: 'enterProjectMode',
        metadata: { projectId },
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const exitProjectMode = useCallback(() => {
    setActiveProject(null)
    setProjectDocuments([])
    setError(null)

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

        if (activeProject && activeProject.id === id) {
          setActiveProject((prev) =>
            prev
              ? {
                  ...prev,
                  name: data.name ?? prev.name,
                  description: data.description ?? prev.description,
                  systemInstructions:
                    data.systemInstructions ?? prev.systemInstructions,
                  summary: data.summary ?? prev.summary,
                  updatedAt: new Date().toISOString(),
                }
              : null,
          )
        }

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
    [activeProject],
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

      setError(null)

      try {
        const document = await projectStorage.uploadDocument(
          activeProject.id,
          file.name,
          file.type || 'text/plain',
          content,
        )

        setProjectDocuments((prev) => [...prev, document])

        logInfo('Uploaded document', {
          component: 'ProjectProvider',
          action: 'uploadDocument',
          metadata: {
            projectId: activeProject.id,
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

      setError(null)

      const removedDoc = projectDocuments.find((doc) => doc.id === docId)
      const removedIndex = projectDocuments.findIndex((doc) => doc.id === docId)

      setProjectDocuments((prev) => prev.filter((doc) => doc.id !== docId))

      try {
        await projectStorage.deleteDocument(activeProject.id, docId)

        logInfo('Removed document', {
          component: 'ProjectProvider',
          action: 'removeDocument',
          metadata: { projectId: activeProject.id, documentId: docId },
        })
      } catch (err) {
        if (removedDoc) {
          setProjectDocuments((prev) => {
            const newDocs = [...prev]
            newDocs.splice(removedIndex, 0, removedDoc)
            return newDocs
          })
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

    try {
      const documentsResponse = await projectStorage.listDocuments(
        activeProject.id,
        {
          includeContent: true,
        },
      )

      const documents: ProjectDocument[] = await Promise.all(
        documentsResponse.documents.map(async (doc) => {
          if (doc.content) {
            try {
              await encryptionService.initialize()
              const decrypted = (await encryptionService.decrypt(
                JSON.parse(doc.content),
              )) as { content: string; filename: string; contentType: string }
              return {
                ...doc,
                content: decrypted.content,
                filename: decrypted.filename,
                contentType: decrypted.contentType,
              }
            } catch (decryptError) {
              logError('Failed to decrypt document', decryptError, {
                component: 'ProjectProvider',
                action: 'refreshDocuments',
                metadata: { documentId: doc.id },
              })
              return {
                ...doc,
                content: undefined,
                filename: '',
                contentType: '',
              }
            }
          }
          return { ...doc, filename: '', contentType: '' }
        }),
      )

      setProjectDocuments(documents)
    } catch (err) {
      logError('Failed to refresh documents', err, {
        component: 'ProjectProvider',
        action: 'refreshDocuments',
        metadata: { projectId: activeProject.id },
      })
    }
  }, [activeProject])

  const updateProjectSummary = useCallback(
    async (summary: string) => {
      if (!activeProject) return

      await updateProject(activeProject.id, { summary })
    },
    [activeProject, updateProject],
  )

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
          summary: 0,
          totalUsed: 0,
          modelLimit: modelContextLimit,
          availableForChat: modelContextLimit,
        }
      }

      const instructionsTokens = estimateTokenCount(
        activeProject.systemInstructions,
      )
      const summaryTokens = estimateTokenCount(activeProject.summary)

      const documentTokens = projectDocuments.map((doc) => ({
        filename: doc.filename,
        tokens: estimateTokenCount(doc.content),
      }))

      const totalDocumentTokens = documentTokens.reduce(
        (sum, d) => sum + d.tokens,
        0,
      )
      const totalUsed = instructionsTokens + totalDocumentTokens + summaryTokens

      return {
        systemInstructions: instructionsTokens,
        documents: documentTokens,
        summary: summaryTokens,
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
      error,
      enterProjectMode,
      exitProjectMode,
      createProject,
      updateProject,
      deleteProject,
      uploadDocument,
      removeDocument,
      refreshDocuments,
      updateProjectSummary,
      getProjectSystemPrompt,
      getContextUsage,
    }),
    [
      activeProject,
      isProjectMode,
      projectDocuments,
      loading,
      error,
      enterProjectMode,
      exitProjectMode,
      createProject,
      updateProject,
      deleteProject,
      uploadDocument,
      removeDocument,
      refreshDocuments,
      updateProjectSummary,
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
