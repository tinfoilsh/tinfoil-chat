'use client'

import { ChatList, type ChatItemData } from '@/components/chat/chat-list'
import { formatRelativeTime } from '@/components/chat/chat-list-utils'
import { useDocumentUploader } from '@/components/chat/document-uploader'
import { TypingAnimation } from '@/components/chat/typing-animation'
import { PiSpinnerThin } from '@/components/icons/lazy-icons'
import { Link } from '@/components/link'
import { Logo } from '@/components/logo'
import { TextureGrid } from '@/components/texture-grid'
import { cn } from '@/components/ui/utils'
import { toast } from '@/hooks/use-toast'
import { projectStorage } from '@/services/cloud/project-storage'
import type { Fact } from '@/types/memory'
import type { Project } from '@/types/project'
import { useAuth, UserButton } from '@clerk/nextjs'
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Cog6ToothIcon,
  DocumentIcon,
  DocumentPlusIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HiOutlineChevronDoubleLeft } from 'react-icons/hi2'
import { LuBrain } from 'react-icons/lu'
import { CONSTANTS } from '../chat/constants'
import { useProject } from './project-context'

const MOBILE_BREAKPOINT = 1024

interface ProjectChat {
  id: string
  title: string
  messageCount: number
  createdAt: Date
  projectId?: string
  isBlankChat?: boolean
}

interface ProjectSidebarProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  project: Project | null
  projectName?: string
  isLoading?: boolean
  isDarkMode: boolean
  onExitProject: () => void
  onNewChat: () => void
  onSelectChat: (chatId: string) => void
  currentChatId?: string
  isClient: boolean
  isPremium?: boolean
  chats?: ProjectChat[]
  deleteChat?: (chatId: string) => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded bg-content-muted/20', className)}
    />
  )
}

export function ProjectSidebar({
  isOpen,
  setIsOpen,
  project,
  projectName,
  isLoading,
  isDarkMode,
  onExitProject,
  onNewChat,
  onSelectChat,
  currentChatId,
  isClient,
  isPremium,
  chats: chatsProp,
  deleteChat,
}: ProjectSidebarProps) {
  const { getToken, isSignedIn } = useAuth()
  const {
    projectDocuments,
    uploadDocument,
    removeDocument,
    updateProject,
    updateProjectMemory,
    deleteProject,
    refreshDocuments,
    loading: contextLoading,
  } = useProject()
  const { handleDocumentUpload: processDocument, isDocumentUploading } =
    useDocumentUploader(isPremium)
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 0,
  )
  const [settingsExpanded, setSettingsExpanded] = useState(false)
  const [documentsExpanded, setDocumentsExpanded] = useState(false)
  const [memoryExpanded, setMemoryExpanded] = useState(false)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [memoryText, setMemoryText] = useState('')
  const [memoryEdited, setMemoryEdited] = useState(false)

  const [editedName, setEditedName] = useState(project?.name ?? '')
  const [editedDescription, setEditedDescription] = useState(
    project?.description ?? '',
  )
  const [editedInstructions, setEditedInstructions] = useState(
    project?.systemInstructions ?? '',
  )
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const [isEditingProjectName, setIsEditingProjectName] = useState(false)
  const [editingProjectName, setEditingProjectName] = useState(
    project?.name ?? '',
  )
  const [uploadingFiles, setUploadingFiles] = useState<
    { id: string; name: string; size: number }[]
  >([])

  const [displayProjectName, setDisplayProjectName] = useState(
    project?.name ?? '',
  )
  const [isAnimatingName, setIsAnimatingName] = useState(false)
  const [animationFromName, setAnimationFromName] = useState('')
  const [animationToName, setAnimationToName] = useState('')
  const prevProjectNameRef = useRef(project?.name ?? '')

  const fileInputRef = useRef<HTMLInputElement>(null)

  const isMac = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    return /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  }, [])
  const modKey = isMac ? '⌘' : 'Ctrl+'

  useEffect(() => {
    if (getToken) {
      projectStorage.setTokenGetter(getToken)
    }
  }, [getToken])

  useEffect(() => {
    if (project) {
      setEditedName(project.name)
      setEditedDescription(project.description)
      setEditedInstructions(project.systemInstructions)
      setEditingProjectName(project.name)

      if (
        prevProjectNameRef.current !== project.name &&
        prevProjectNameRef.current !== ''
      ) {
        setAnimationFromName(prevProjectNameRef.current)
        setAnimationToName(project.name)
        setIsAnimatingName(true)
      } else {
        setDisplayProjectName(project.name)
        prevProjectNameRef.current = project.name
      }
    }
  }, [project])

  useEffect(() => {
    refreshDocuments()
  }, [refreshDocuments])

  // Expand documents section when signal is set (from file upload to project context)
  useEffect(() => {
    if (isOpen) {
      const shouldExpandDocs = sessionStorage.getItem('expandProjectDocuments')
      if (shouldExpandDocs === 'true') {
        setDocumentsExpanded(true)
        sessionStorage.removeItem('expandProjectDocuments')
      }
    }
  }, [isOpen])

  useEffect(() => {
    if (isClient) {
      const handleResize = () => {
        setWindowWidth(window.innerWidth)
      }
      // Set initial width on mount
      handleResize()
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }
  }, [isClient])

  // Sync memory text with project memory
  const projectId = project?.id
  const projectMemory = project?.memory
  useEffect(() => {
    if (projectId && !memoryEdited) {
      setMemoryText((projectMemory || []).map((f) => f.fact).join('\n'))
    }
  }, [projectId, projectMemory, memoryEdited])

  const handleMemoryChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setMemoryText(e.target.value)
      setMemoryEdited(true)
    },
    [],
  )

  const handleMemorySave = useCallback(async () => {
    if (!memoryEdited || !project) return

    const newLines = memoryText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    const existingFacts = project.memory || []
    const existingByFact = new Map(existingFacts.map((f) => [f.fact, f]))

    const updatedFacts: Fact[] = newLines.map((line) => {
      const existing = existingByFact.get(line)
      if (existing) {
        return existing
      }
      return {
        fact: line,
        date: new Date().toISOString(),
        category: 'other',
        confidence: 1,
      }
    })

    await updateProjectMemory(updatedFacts)
    setMemoryEdited(false)
  }, [memoryEdited, memoryText, project, updateProjectMemory])

  const handleSaveSettings = useCallback(async () => {
    if (!project) return
    setIsSaving(true)
    try {
      await updateProject(project.id, {
        name: editedName,
        description: editedDescription,
        systemInstructions: editedInstructions,
      })
    } catch {
      toast({
        title: 'Failed to save project settings',
        description:
          'The project settings could not be saved. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }, [
    project,
    editedName,
    editedDescription,
    editedInstructions,
    updateProject,
  ])

  const handleSaveProjectName = useCallback(async () => {
    if (!project || isSaving) return
    if (editingProjectName.trim() && editingProjectName !== project.name) {
      setIsSaving(true)
      try {
        await updateProject(project.id, {
          name: editingProjectName.trim(),
        })
        setEditedName(editingProjectName.trim())
      } catch {
        toast({
          title: 'Failed to save project name',
          description: 'The project name could not be saved. Please try again.',
          variant: 'destructive',
        })
      } finally {
        setIsSaving(false)
      }
    }
    setIsEditingProjectName(false)
  }, [editingProjectName, isSaving, project, updateProject])

  const handleNameAnimationComplete = useCallback(() => {
    if (project) {
      setDisplayProjectName(project.name)
      setIsAnimatingName(false)
      prevProjectNameRef.current = project.name
    }
  }, [project])

  const handleDeleteProject = useCallback(async () => {
    if (!project) return
    setIsDeleting(true)
    try {
      await deleteProject(project.id)
      onExitProject()
    } catch {
      toast({
        title: 'Failed to delete project',
        description: 'The project could not be deleted. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }, [project, deleteProject, onExitProject])

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files || files.length === 0) return

      const fileArray = Array.from(files)
      const uploadIds = fileArray.map(() => crypto.randomUUID())

      setUploadingFiles((prev) => [
        ...prev,
        ...fileArray.map((file, i) => ({
          id: uploadIds[i],
          name: file.name,
          size: file.size,
        })),
      ])

      await Promise.all(
        fileArray.map(async (file, i) => {
          return new Promise<void>((resolve) => {
            processDocument(
              file,
              async (content) => {
                try {
                  await uploadDocument(file, content)
                } catch {
                  toast({
                    title: 'Upload failed',
                    description:
                      'Failed to upload the document. Please try again.',
                    variant: 'destructive',
                  })
                } finally {
                  setUploadingFiles((prev) =>
                    prev.filter((f) => f.id !== uploadIds[i]),
                  )
                  resolve()
                }
              },
              (error) => {
                toast({
                  title: 'Upload failed',
                  description: error.message,
                  variant: 'destructive',
                })
                setUploadingFiles((prev) =>
                  prev.filter((f) => f.id !== uploadIds[i]),
                )
                resolve()
              },
            )
          })
        }),
      )

      e.target.value = ''
    },
    [uploadDocument, processDocument],
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDraggingOver(false)

      const files = e.dataTransfer.files
      if (!files || files.length === 0) return

      const fileArray = Array.from(files)
      const uploadIds = fileArray.map(() => crypto.randomUUID())

      setUploadingFiles((prev) => [
        ...prev,
        ...fileArray.map((file, i) => ({
          id: uploadIds[i],
          name: file.name,
          size: file.size,
        })),
      ])

      await Promise.all(
        fileArray.map(async (file, i) => {
          return new Promise<void>((resolve) => {
            processDocument(
              file,
              async (content) => {
                try {
                  await uploadDocument(file, content)
                } catch {
                  toast({
                    title: 'Upload failed',
                    description:
                      'Failed to upload the document. Please try again.',
                    variant: 'destructive',
                  })
                } finally {
                  setUploadingFiles((prev) =>
                    prev.filter((f) => f.id !== uploadIds[i]),
                  )
                  resolve()
                }
              },
              (error) => {
                toast({
                  title: 'Upload failed',
                  description: error.message,
                  variant: 'destructive',
                })
                setUploadingFiles((prev) =>
                  prev.filter((f) => f.id !== uploadIds[i]),
                )
                resolve()
              },
            )
          })
        }),
      )
    },
    [uploadDocument, processDocument],
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)
  }, [])

  const handleChatSelect = useCallback(
    (chatId: string) => {
      onSelectChat(chatId)
      if (windowWidth < MOBILE_BREAKPOINT) {
        setIsOpen(false)
      }
    },
    [onSelectChat, windowWidth, setIsOpen],
  )

  const handleNewChat = useCallback(() => {
    onNewChat()
    if (windowWidth < MOBILE_BREAKPOINT) {
      setIsOpen(false)
    }
  }, [onNewChat, windowWidth, setIsOpen])

  const handleRemoveDocument = useCallback(
    async (docId: string) => {
      try {
        await removeDocument(docId)
      } catch {
        toast({
          title: 'Failed to delete document',
          description: 'The document could not be deleted. Please try again.',
          variant: 'destructive',
        })
      }
    },
    [removeDocument],
  )

  const handleDeleteChat = useCallback(
    (chatId: string) => {
      if (deleteChat) {
        deleteChat(chatId)
      }
    },
    [deleteChat],
  )

  const hasUnsavedChanges = project
    ? editedName !== project.name ||
      editedDescription !== project.description ||
      editedInstructions !== project.systemInstructions
    : false

  const blankChat: ChatItemData = {
    id: '',
    title: 'New Chat',
    messageCount: 0,
    updatedAt: new Date().toISOString(),
    isBlankChat: true,
  }

  // Convert chatsProp to ChatItemData format and sort by createdAt descending
  const projectChats: ChatItemData[] = (chatsProp || [])
    .filter((c) => !c.isBlankChat)
    .map((c) => ({
      id: c.id,
      title: c.title,
      messageCount: c.messageCount,
      updatedAt:
        c.createdAt instanceof Date
          ? c.createdAt.toISOString()
          : new Date(c.createdAt).toISOString(),
    }))
    .sort(
      (a, b) =>
        new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime(),
    )

  const chatsWithBlank: ChatItemData[] = [blankChat, ...projectChats]

  return (
    <>
      <div
        className={cn(
          'fixed z-40 flex h-dvh w-[85vw] flex-col overflow-hidden border-r',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'border-border-subtle bg-surface-sidebar text-content-primary',
          'transition-all duration-200 ease-in-out',
        )}
        style={{ maxWidth: `${CONSTANTS.CHAT_SIDEBAR_WIDTH_PX}px` }}
      >
        {/* Header */}
        <div className="flex h-16 flex-none items-center justify-between border-b border-border-subtle p-4">
          <Link
            href="https://www.tinfoil.sh"
            title="Home"
            className="flex items-center"
          >
            <Logo className="mt-1 h-6 w-auto" dark={isDarkMode} />
          </Link>
          {isSignedIn && (
            <UserButton
              appearance={{
                elements: {
                  avatarBox: 'w-8 h-8',
                },
              }}
            />
          )}
        </div>

        {/* Main sidebar content */}
        <div className="relative flex h-full flex-col overflow-hidden">
          <TextureGrid />

          {/* Project header with exit button and editable title */}
          <div className="relative z-10 flex-none p-3">
            <button
              onClick={onExitProject}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg p-2 text-sm transition-colors',
                isDarkMode
                  ? 'text-content-secondary hover:bg-surface-chat'
                  : 'text-content-secondary hover:bg-surface-sidebar',
              )}
            >
              <ArrowLeftIcon className="h-4 w-4" />
              <span className="font-aeonik font-medium">Exit Project</span>
            </button>
            <div className="mt-2 px-2">
              {isLoading ? (
                <div className="space-y-2">
                  <h2 className="truncate font-aeonik text-lg font-semibold text-content-primary">
                    {projectName || 'Loading...'}
                  </h2>
                  <Shimmer className="h-3 w-32" />
                </div>
              ) : isEditingProjectName && project ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleSaveProjectName()
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={editingProjectName}
                    onChange={(e) => setEditingProjectName(e.target.value)}
                    onBlur={handleSaveProjectName}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setEditingProjectName(project.name)
                        setIsEditingProjectName(false)
                      }
                    }}
                    autoFocus
                    className={cn(
                      'w-full rounded-md border px-2 py-1 font-aeonik text-lg font-semibold',
                      isDarkMode
                        ? 'border-border-strong bg-surface-chat text-content-primary'
                        : 'border-border-subtle bg-white text-content-primary',
                      'focus:outline-none focus:ring-2 focus:ring-emerald-500',
                    )}
                  />
                </form>
              ) : project ? (
                <>
                  <div
                    className="group flex cursor-pointer items-center gap-2"
                    onClick={() => setIsEditingProjectName(true)}
                  >
                    <h2 className="truncate font-aeonik text-lg font-semibold text-content-primary">
                      {isAnimatingName ? (
                        <TypingAnimation
                          fromText={animationFromName}
                          toText={animationToName}
                          onComplete={handleNameAnimationComplete}
                        />
                      ) : (
                        displayProjectName
                      )}
                    </h2>
                    <PencilSquareIcon className="h-4 w-4 text-content-muted opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <p className="mt-0.5 font-aeonik-fono text-xs text-content-muted">
                    Updated {formatRelativeTime(new Date(project.updatedAt))}
                  </p>
                </>
              ) : null}
            </div>
          </div>

          {/* Project Settings Dropdown - moved up */}
          <div className="relative z-10 mt-3 flex-none border-y border-border-subtle">
            <button
              onClick={() =>
                !isLoading && setSettingsExpanded(!settingsExpanded)
              }
              disabled={isLoading}
              className={cn(
                'flex w-full items-center justify-between bg-surface-sidebar px-4 py-3 text-sm transition-colors',
                isLoading
                  ? 'cursor-default opacity-50'
                  : isDarkMode
                    ? 'text-content-secondary hover:bg-surface-chat'
                    : 'text-content-secondary hover:bg-white',
              )}
            >
              <span className="flex items-center gap-2">
                <Cog6ToothIcon className="h-4 w-4" />
                <span className="font-aeonik font-medium">
                  Project Settings
                </span>
              </span>
              {settingsExpanded && !isLoading ? (
                <ChevronUpIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
            </button>

            {settingsExpanded && !isLoading && (
              <div className="px-4 py-4">
                <div className="space-y-3">
                  {/* Description */}
                  <div
                    className={cn(
                      'rounded-lg border border-border-subtle p-3',
                      isDarkMode ? 'bg-surface-sidebar' : 'bg-white',
                    )}
                  >
                    <div className="space-y-2">
                      <div>
                        <div className="font-aeonik text-sm font-medium text-content-secondary">
                          Description
                        </div>
                        <div className="font-aeonik-fono text-xs text-content-muted">
                          Brief summary of this project
                        </div>
                      </div>
                      <textarea
                        value={editedDescription}
                        onChange={(e) => setEditedDescription(e.target.value)}
                        placeholder="Brief description..."
                        rows={2}
                        className={cn(
                          'w-full resize-none rounded-md border px-3 py-2 text-sm',
                          isDarkMode
                            ? 'border-border-strong bg-surface-chat text-content-secondary placeholder:text-content-muted'
                            : 'border-border-subtle bg-surface-sidebar text-content-primary placeholder:text-content-muted',
                          'focus:outline-none focus:ring-2 focus:ring-emerald-500',
                        )}
                      />
                    </div>
                  </div>

                  {/* System Instructions */}
                  <div
                    className={cn(
                      'rounded-lg border border-border-subtle p-3',
                      isDarkMode ? 'bg-surface-sidebar' : 'bg-white',
                    )}
                  >
                    <div className="space-y-2">
                      <div>
                        <div className="font-aeonik text-sm font-medium text-content-secondary">
                          System Instructions
                        </div>
                        <div className="font-aeonik-fono text-xs text-content-muted">
                          Custom instructions for all chats in this project
                        </div>
                      </div>
                      <textarea
                        value={editedInstructions}
                        onChange={(e) => setEditedInstructions(e.target.value)}
                        placeholder="Custom instructions..."
                        rows={4}
                        className={cn(
                          'w-full resize-none rounded-md border px-3 py-2 font-mono text-xs',
                          isDarkMode
                            ? 'border-border-strong bg-surface-chat text-content-secondary placeholder:text-content-muted'
                            : 'border-border-subtle bg-surface-sidebar text-content-primary placeholder:text-content-muted',
                          'focus:outline-none focus:ring-2 focus:ring-emerald-500',
                        )}
                      />
                    </div>
                  </div>

                  {/* Save button */}
                  {hasUnsavedChanges && (
                    <button
                      onClick={handleSaveSettings}
                      disabled={isSaving}
                      className={cn(
                        'w-full rounded-lg px-3 py-2 font-aeonik text-sm font-medium transition-colors',
                        'bg-emerald-600 text-white hover:bg-emerald-700',
                        isSaving && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                  )}

                  {/* Delete Project */}
                  {showDeleteConfirm ? (
                    <div className="rounded-lg bg-red-600 p-3">
                      <p className="mb-3 font-aeonik-fono text-xs text-white">
                        Delete this project? This cannot be undone.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleDeleteProject}
                          disabled={isDeleting}
                          className={cn(
                            'flex-1 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50',
                            isDeleting && 'cursor-not-allowed opacity-50',
                          )}
                        >
                          {isDeleting ? 'Deleting...' : 'Delete'}
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
                          className="flex-1 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 dark:border-red-500/30 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/40"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                      Delete Project
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Documents Section - moved below settings */}
          <div className="relative z-10 flex-none border-b border-border-subtle">
            <button
              onClick={() =>
                !isLoading && setDocumentsExpanded(!documentsExpanded)
              }
              disabled={isLoading}
              className={cn(
                'flex w-full items-center justify-between bg-surface-sidebar px-4 py-3 text-sm transition-colors',
                isLoading
                  ? 'cursor-default opacity-50'
                  : isDarkMode
                    ? 'text-content-secondary hover:bg-surface-chat'
                    : 'text-content-secondary hover:bg-white',
              )}
            >
              <span className="flex items-center gap-2">
                <DocumentIcon className="h-4 w-4" />
                <span className="font-aeonik font-medium">
                  Documents {isLoading ? '' : `(${projectDocuments.length})`}
                </span>
              </span>
              {documentsExpanded && !isLoading ? (
                <ChevronUpIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileUpload}
              disabled={contextLoading}
              accept=".pdf,.docx,.xlsx,.pptx,.md,.html,.xhtml,.csv,.png,.jpg,.jpeg,.tiff,.bmp,.webp,.txt"
            />

            {documentsExpanded && !isLoading && (
              <div className="max-h-64 overflow-y-auto px-2 py-2">
                {/* Drag and drop zone - at top */}
                <div
                  onClick={() =>
                    !contextLoading && fileInputRef.current?.click()
                  }
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={cn(
                    'flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 transition-colors',
                    contextLoading
                      ? 'cursor-not-allowed opacity-50'
                      : 'cursor-pointer',
                    projectDocuments.length > 0 || uploadingFiles.length > 0
                      ? 'mb-2 py-3'
                      : 'py-6',
                    isDraggingOver
                      ? isDarkMode
                        ? 'border-emerald-400 bg-emerald-950/30'
                        : 'border-emerald-500 bg-emerald-50'
                      : isDarkMode
                        ? 'border-border-strong hover:border-emerald-500/50 hover:bg-surface-chat'
                        : 'border-border-subtle hover:border-emerald-500/50 hover:bg-surface-sidebar',
                  )}
                >
                  <DocumentPlusIcon
                    className={cn(
                      'h-5 w-5',
                      projectDocuments.length === 0 &&
                        uploadingFiles.length === 0 &&
                        'mb-2 h-6 w-6',
                      isDarkMode ? 'text-content-muted' : 'text-content-muted',
                    )}
                  />
                  {projectDocuments.length === 0 &&
                    uploadingFiles.length === 0 && (
                      <>
                        <p className="text-center font-aeonik-fono text-xs text-content-muted">
                          Drop files here or click to upload
                        </p>
                        <p className="mt-1 text-center font-aeonik-fono text-[10px] text-content-muted">
                          PDF, TXT, MD, DOCX, XLSX, PPTX, HTML, CSV, images
                        </p>
                      </>
                    )}
                </div>

                {/* Document list */}
                {(projectDocuments.length > 0 || uploadingFiles.length > 0) && (
                  <div className="space-y-1">
                    {/* Uploading placeholder documents - newest at top */}
                    {[...uploadingFiles].reverse().map((file) => (
                      <div
                        key={file.id}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-2 py-1.5 opacity-70',
                          isDarkMode ? 'bg-surface-chat' : 'bg-surface-sidebar',
                        )}
                      >
                        <PiSpinnerThin
                          className={cn(
                            'h-4 w-4 flex-shrink-0 animate-spin',
                            isDarkMode
                              ? 'text-emerald-400'
                              : 'text-emerald-600',
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-aeonik-fono text-xs text-content-primary">
                            {file.name}
                          </div>
                          <div className="font-aeonik-fono text-[10px] text-content-muted">
                            Uploading...
                          </div>
                        </div>
                      </div>
                    ))}
                    {/* Existing documents - newest at top */}
                    {[...projectDocuments].reverse().map((doc) => (
                      <div
                        key={doc.id}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-2 py-1.5',
                          isDarkMode ? 'bg-surface-chat' : 'bg-surface-sidebar',
                        )}
                      >
                        <DocumentIcon
                          className={cn(
                            'h-4 w-4 flex-shrink-0',
                            isDarkMode
                              ? 'text-emerald-400'
                              : 'text-emerald-600',
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-aeonik-fono text-xs text-content-primary">
                            {doc.filename}
                          </div>
                          <div className="font-aeonik-fono text-[10px] text-content-muted">
                            {formatFileSize(doc.sizeBytes)}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveDocument(doc.id)}
                          disabled={contextLoading}
                          className={cn(
                            'rounded p-0.5 transition-colors',
                            isDarkMode
                              ? 'text-content-muted hover:text-red-400'
                              : 'text-content-muted hover:text-red-600',
                            contextLoading && 'cursor-not-allowed opacity-50',
                          )}
                        >
                          <TrashIcon className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Memory Section */}
          <div className="relative z-10 flex-none border-b border-border-subtle">
            <button
              onClick={() => !isLoading && setMemoryExpanded(!memoryExpanded)}
              disabled={isLoading}
              className={cn(
                'flex w-full items-center justify-between bg-surface-sidebar px-4 py-3 text-sm transition-colors',
                isLoading
                  ? 'cursor-default opacity-50'
                  : isDarkMode
                    ? 'text-content-secondary hover:bg-surface-chat'
                    : 'text-content-secondary hover:bg-white',
              )}
            >
              <span className="flex items-center gap-2">
                <LuBrain className="h-4 w-4" />
                <span className="font-aeonik font-medium">Memory</span>
              </span>
              {memoryExpanded && !isLoading ? (
                <ChevronUpIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
            </button>

            {memoryExpanded && !isLoading && (
              <div className="px-4 pb-3 pt-2">
                {(project?.memory?.length ?? 0) === 0 ? (
                  <p className="py-2 text-center font-aeonik-fono text-xs text-content-muted">
                    No memory yet. Memory will appear here as you have
                    conversations.
                  </p>
                ) : (
                  <>
                    <textarea
                      value={memoryText}
                      onChange={handleMemoryChange}
                      placeholder="Facts about this project (one per line)..."
                      rows={6}
                      className={cn(
                        'w-full resize-none rounded-md border px-3 py-2 font-aeonik-fono text-xs',
                        isDarkMode
                          ? 'border-border-strong bg-surface-chat text-content-secondary placeholder:text-content-muted'
                          : 'border-border-subtle bg-surface-sidebar text-content-primary placeholder:text-content-muted',
                        'focus:outline-none focus:ring-2 focus:ring-emerald-500',
                      )}
                    />
                    {memoryEdited && (
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={handleMemorySave}
                          className={cn(
                            'flex-1 rounded-lg px-3 py-1.5 font-aeonik text-xs font-medium transition-colors',
                            'bg-emerald-600 text-white hover:bg-emerald-700',
                          )}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setMemoryText(
                              (project?.memory || [])
                                .map((f) => f.fact)
                                .join('\n'),
                            )
                            setMemoryEdited(false)
                          }}
                          className={cn(
                            'flex-1 rounded-lg px-3 py-1.5 font-aeonik text-xs font-medium transition-colors',
                            isDarkMode
                              ? 'bg-surface-chat text-content-secondary hover:bg-surface-chat/80'
                              : 'bg-surface-sidebar text-content-primary hover:bg-white',
                            'border border-border-subtle',
                          )}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Chat History Header */}
          <div className="relative z-10 flex-none border-b border-border-subtle px-3 py-2 sm:px-4 sm:py-3">
            <h3 className="truncate font-aeonik-fono text-sm font-medium text-content-primary">
              Project Chats
            </h3>
            <p className="font-aeonik-fono text-xs text-content-muted">
              Chats in this project share context and documents.
            </p>
          </div>

          {/* Scrollable Chat List */}
          <div className="relative z-10 flex-1 overflow-y-auto">
            <ChatList
              chats={chatsWithBlank}
              currentChatId={currentChatId}
              currentChatIsBlank={!currentChatId}
              isDarkMode={isDarkMode}
              isLoading={isLoading}
              enableTitleAnimation={true}
              animatedDeleteConfirmation={false}
              onSelectChat={(chatId) => {
                if (chatId.startsWith('blank-') || chatId === '') {
                  handleNewChat()
                } else {
                  handleChatSelect(chatId)
                }
              }}
              onDeleteChat={handleDeleteChat}
            />
          </div>

          {/* Terms and privacy policy */}
          <div className="relative z-10 flex h-[56px] flex-none items-center justify-center border-t border-border-subtle bg-surface-sidebar p-3">
            <p className="text-center text-xs leading-relaxed text-content-secondary">
              By using this service, you agree to Tinfoil&apos;s{' '}
              <Link
                href="https://tinfoil.sh/terms"
                className={
                  isDarkMode
                    ? 'text-white underline hover:text-content-secondary'
                    : 'text-brand-accent-dark underline hover:text-brand-accent-dark/80'
                }
              >
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                href="https://tinfoil.sh/privacy"
                className={
                  isDarkMode
                    ? 'text-white underline hover:text-content-secondary'
                    : 'text-brand-accent-dark underline hover:text-brand-accent-dark/80'
                }
              >
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Close button on the right edge - outside overflow-hidden container */}
      <div
        className="group fixed top-8 z-40 -translate-y-1/2 transition-all duration-200 ease-in-out"
        style={{
          left: isOpen
            ? `min(85vw, ${CONSTANTS.CHAT_SIDEBAR_WIDTH_PX}px)`
            : `calc(min(85vw, ${CONSTANTS.CHAT_SIDEBAR_WIDTH_PX}px) - 100%)`,
        }}
      >
        <button
          onClick={() => setIsOpen(false)}
          className={cn(
            'rounded-r-lg border border-l-0 p-2 transition-colors',
            isDarkMode
              ? 'border-border-subtle bg-surface-sidebar text-content-secondary hover:bg-surface-chat hover:text-content-primary'
              : 'border-border-subtle bg-surface-sidebar text-content-secondary hover:bg-white hover:text-content-primary',
          )}
        >
          <HiOutlineChevronDoubleLeft className="h-4 w-4" />
        </button>
        <span
          className={cn(
            'pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded border border-border-subtle bg-surface-chat-background px-2 py-1 text-xs text-content-primary opacity-0 shadow-sm transition-opacity group-hover:opacity-100',
            !isOpen && 'hidden',
          )}
        >
          Close sidebar{' '}
          <span className="ml-1.5 text-content-muted">{modKey}.</span>
        </span>
      </div>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}
