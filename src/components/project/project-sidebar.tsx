'use client'

import { useDocumentUploader } from '@/components/chat/document-uploader'
import { PiSpinnerThin } from '@/components/icons/lazy-icons'
import { Link } from '@/components/link'
import { Logo } from '@/components/logo'
import { TextureGrid } from '@/components/texture-grid'
import { cn } from '@/components/ui/utils'
import { toast } from '@/hooks/use-toast'
import { projectStorage } from '@/services/cloud/project-storage'
import type { Project } from '@/types/project'
import { useAuth, UserButton } from '@clerk/nextjs'
import {
  ArrowLeftIcon,
  Bars3Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  Cog6ToothIcon,
  DocumentIcon,
  DocumentPlusIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useProject } from './project-context'

const SIDEBAR_WIDTH_PX = 320
const MOBILE_BREAKPOINT = 1024

interface DecryptedChat {
  id: string
  title: string
  messageCount: number
  updatedAt: string
  isBlankChat?: boolean
}

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
  project: Project
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

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return `${seconds}s ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  return date.toLocaleDateString()
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ProjectSidebar({
  isOpen,
  setIsOpen,
  project,
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
  const [documentsExpanded, setDocumentsExpanded] = useState(true)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null)

  const [editedName, setEditedName] = useState(project.name)
  const [editedDescription, setEditedDescription] = useState(
    project.description,
  )
  const [editedInstructions, setEditedInstructions] = useState(
    project.systemInstructions,
  )
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const [isEditingProjectName, setIsEditingProjectName] = useState(false)
  const [editingProjectName, setEditingProjectName] = useState(project.name)
  const [uploadingFiles, setUploadingFiles] = useState<
    { id: string; name: string; size: number }[]
  >([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (getToken) {
      projectStorage.setTokenGetter(getToken)
    }
  }, [getToken])

  useEffect(() => {
    setEditedName(project.name)
    setEditedDescription(project.description)
    setEditedInstructions(project.systemInstructions)
    setEditingProjectName(project.name)
  }, [project])

  useEffect(() => {
    refreshDocuments()
  }, [refreshDocuments])

  useEffect(() => {
    if (isClient) {
      const handleResize = () => {
        setWindowWidth(window.innerWidth)
      }
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }
  }, [isClient])

  const handleSaveSettings = useCallback(async () => {
    setIsSaving(true)
    try {
      await updateProject(project.id, {
        name: editedName,
        description: editedDescription,
        systemInstructions: editedInstructions,
      })
    } finally {
      setIsSaving(false)
    }
  }, [
    project.id,
    editedName,
    editedDescription,
    editedInstructions,
    updateProject,
  ])

  const handleSaveProjectName = useCallback(async () => {
    if (editingProjectName.trim() && editingProjectName !== project.name) {
      setIsSaving(true)
      try {
        await updateProject(project.id, {
          name: editingProjectName.trim(),
        })
        setEditedName(editingProjectName.trim())
      } finally {
        setIsSaving(false)
      }
    }
    setIsEditingProjectName(false)
  }, [editingProjectName, project.id, project.name, updateProject])

  const handleDeleteProject = useCallback(async () => {
    setIsDeleting(true)
    try {
      await deleteProject(project.id)
      onExitProject()
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }, [project.id, deleteProject, onExitProject])

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

  const hasUnsavedChanges =
    editedName !== project.name ||
    editedDescription !== project.description ||
    editedInstructions !== project.systemInstructions

  const blankChat: DecryptedChat = {
    id: '',
    title: 'New Chat',
    messageCount: 0,
    updatedAt: new Date().toISOString(),
    isBlankChat: true,
  }

  // Convert chatsProp to DecryptedChat format and sort by createdAt descending
  const projectChats: DecryptedChat[] = (chatsProp || [])
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
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )

  const chatsWithBlank = [blankChat, ...projectChats]

  return (
    <>
      <div
        className={cn(
          'fixed z-40 flex h-dvh w-[85vw] flex-col overflow-hidden border-r',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'border-border-subtle bg-surface-sidebar text-content-primary',
          'transition-all duration-200 ease-in-out',
        )}
        style={{ maxWidth: `${SIDEBAR_WIDTH_PX}px` }}
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
          <div className="flex items-center gap-3">
            {isSignedIn && (
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: 'w-8 h-8',
                  },
                }}
              />
            )}
            <button
              className="hidden items-center justify-center rounded-lg border border-border-subtle bg-surface-chat p-2 text-content-primary transition-all duration-200 hover:bg-surface-chat/80 md:flex"
              onClick={() => setIsOpen(!isOpen)}
            >
              {isOpen ? (
                <XMarkIcon className="h-5 w-5" />
              ) : (
                <Bars3Icon className="h-5 w-5" />
              )}
            </button>
            <button
              className="rounded-lg border border-border-subtle bg-surface-chat p-2 text-content-primary transition-all duration-200 hover:bg-surface-chat/80 md:hidden"
              onClick={() => setIsOpen(false)}
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
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
              {isEditingProjectName ? (
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
              ) : (
                <div
                  className="group flex cursor-pointer items-center gap-2"
                  onClick={() => setIsEditingProjectName(true)}
                >
                  <h2 className="truncate font-aeonik text-lg font-semibold text-content-primary">
                    {project.name}
                  </h2>
                  <PencilSquareIcon className="h-4 w-4 text-content-muted opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              )}
              {project.description && !isEditingProjectName && (
                <p className="mt-0.5 truncate font-aeonik-fono text-xs text-content-muted">
                  {project.description}
                </p>
              )}
            </div>
          </div>

          {/* Project Settings Dropdown - moved up */}
          <div className="relative z-10 mt-3 flex-none border-y border-border-subtle">
            <button
              onClick={() => setSettingsExpanded(!settingsExpanded)}
              className={cn(
                'flex w-full items-center justify-between bg-surface-sidebar px-4 py-3 text-sm transition-colors',
                isDarkMode
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
              {settingsExpanded ? (
                <ChevronUpIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
            </button>

            {settingsExpanded && (
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
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-950/40"
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
          <div className="relative z-10 mb-3 flex-none border-b border-border-subtle">
            <button
              onClick={() => setDocumentsExpanded(!documentsExpanded)}
              className={cn(
                'flex w-full items-center justify-between bg-surface-sidebar px-4 py-3 text-sm transition-colors',
                isDarkMode
                  ? 'text-content-secondary hover:bg-surface-chat'
                  : 'text-content-secondary hover:bg-white',
              )}
            >
              <span className="flex items-center gap-2">
                <DocumentIcon className="h-4 w-4" />
                <span className="font-aeonik font-medium">
                  Documents ({projectDocuments.length})
                </span>
              </span>
              {documentsExpanded ? (
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

            {documentsExpanded && (
              <div className="max-h-64 overflow-y-auto px-2 py-2">
                {/* Drag and drop zone - at top */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={cn(
                    'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 transition-colors',
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
                        <p className="font-aeonik-fono text-xs text-content-muted">
                          Drop files here or click to upload
                        </p>
                        <p className="mt-1 font-aeonik-fono text-[10px] text-content-muted">
                          PDF, TXT, MD, DOCX, XLSX, PPTX
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
            <div className="space-y-2 p-2">
              {chatsWithBlank.map((chat) => (
                <div key={chat.id || 'blank-chat'} className="relative">
                  <div
                    onClick={() => {
                      if (chat.isBlankChat) {
                        handleNewChat()
                      } else {
                        handleChatSelect(chat.id)
                      }
                    }}
                    className={cn(
                      'group flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      chat.isBlankChat
                        ? !currentChatId
                          ? isDarkMode
                            ? 'bg-surface-chat text-white'
                            : 'bg-white text-content-primary'
                          : isDarkMode
                            ? 'text-content-secondary hover:bg-surface-chat'
                            : 'text-content-secondary hover:bg-surface-sidebar'
                        : currentChatId === chat.id
                          ? isDarkMode
                            ? 'bg-surface-chat text-white'
                            : 'bg-white text-content-primary'
                          : isDarkMode
                            ? 'text-content-secondary hover:bg-surface-chat'
                            : 'text-content-secondary hover:bg-surface-sidebar',
                    )}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      {editingChatId === chat.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault()
                            setEditingChatId(null)
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            className="w-full rounded bg-surface-sidebar px-2 py-1 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            autoFocus
                          />
                        </form>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5">
                            <div className="truncate font-aeonik-fono text-sm font-medium">
                              {chat.title}
                            </div>
                            {/* New chat indicator - show for blank chats or chats with 0 messages */}
                            {(chat.isBlankChat || chat.messageCount === 0) && (
                              <div
                                className="h-1.5 w-1.5 rounded-full bg-blue-500"
                                title="New chat"
                              />
                            )}
                          </div>
                          <div className="mt-1 flex min-h-[16px] w-full items-center">
                            {!chat.isBlankChat && chat.messageCount > 0 && (
                              <div className="text-xs leading-none text-content-muted">
                                {formatRelativeTime(new Date(chat.updatedAt))}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    {editingChatId !== chat.id && !chat.isBlankChat && (
                      <div className="flex flex-shrink-0 items-center gap-1.5 opacity-0 group-hover:opacity-100">
                        <button
                          className={cn(
                            'rounded p-1 transition-colors',
                            isDarkMode
                              ? 'text-content-muted hover:bg-surface-chat hover:text-white'
                              : 'text-content-muted hover:bg-surface-sidebar hover:text-content-secondary',
                          )}
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingTitle(chat.title)
                            setEditingChatId(chat.id)
                          }}
                          title="Rename"
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </button>
                        <button
                          className={cn(
                            'rounded p-1 transition-colors',
                            isDarkMode
                              ? 'text-content-muted hover:bg-surface-chat hover:text-white'
                              : 'text-content-muted hover:bg-surface-sidebar hover:text-content-secondary',
                          )}
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeletingChatId(chat.id)
                          }}
                          title="Delete"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  {deletingChatId === chat.id && (
                    <div className="absolute inset-x-0 top-0 z-50 flex gap-2 rounded-md bg-surface-sidebar p-2 shadow-lg">
                      <button
                        className={cn(
                          'flex-1 rounded-md p-2 text-sm font-medium transition-colors',
                          isDarkMode
                            ? 'bg-surface-chat text-content-primary hover:bg-surface-chat/80'
                            : 'bg-surface-chat text-content-secondary hover:bg-surface-chat/80',
                        )}
                        onClick={() => setDeletingChatId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className={cn(
                          'flex-1 rounded-md p-2 text-sm font-medium transition-colors',
                          isDarkMode
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'bg-red-500 text-white hover:bg-red-600',
                        )}
                        onClick={() => {
                          handleDeleteChat(chat.id)
                          setDeletingChatId(null)
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
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
