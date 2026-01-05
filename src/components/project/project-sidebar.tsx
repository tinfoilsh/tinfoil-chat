'use client'

import { Link } from '@/components/link'
import { Logo } from '@/components/logo'
import { TextureGrid } from '@/components/texture-grid'
import { cn } from '@/components/ui/utils'
import { projectStorage } from '@/services/cloud/project-storage'
import { encryptionService } from '@/services/encryption/encryption-service'
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
  PlusIcon,
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

  const [chats, setChats] = useState<DecryptedChat[]>([])
  const [loadingChats, setLoadingChats] = useState(true)
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 0,
  )
  const [settingsExpanded, setSettingsExpanded] = useState(false)
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
  }, [project])

  useEffect(() => {
    async function loadChats() {
      setLoadingChats(true)
      try {
        const response = await projectStorage.listProjectChats(project.id, {
          includeContent: true,
        })

        await encryptionService.initialize()

        const decryptedChats: DecryptedChat[] = await Promise.all(
          response.chats.map(async (chat) => {
            try {
              if (chat.content) {
                const decrypted = (await encryptionService.decrypt(
                  JSON.parse(chat.content),
                )) as { title?: string; messages?: unknown[] }
                return {
                  id: chat.id,
                  title: decrypted.title || 'Untitled Chat',
                  messageCount: decrypted.messages?.length || 0,
                  updatedAt: chat.updatedAt,
                }
              }
              return {
                id: chat.id,
                title: 'Untitled Chat',
                messageCount: chat.messageCount,
                updatedAt: chat.updatedAt,
              }
            } catch {
              return {
                id: chat.id,
                title: 'Encrypted Chat',
                messageCount: chat.messageCount,
                updatedAt: chat.updatedAt,
              }
            }
          }),
        )

        setChats(decryptedChats)
      } catch {
        setChats([])
      } finally {
        setLoadingChats(false)
      }
    }

    loadChats()
  }, [project.id])

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
      const file = e.target.files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = async () => {
        const content = reader.result as string
        await uploadDocument(file, content)
      }
      reader.readAsText(file)
      e.target.value = ''
    },
    [uploadDocument],
  )

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

  const hasUnsavedChanges =
    editedName !== project.name ||
    editedDescription !== project.description ||
    editedInstructions !== project.systemInstructions

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

          {/* Project header with exit button */}
          <div className="relative z-10 flex-none border-b border-border-subtle p-3">
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
              <h2 className="truncate font-aeonik text-lg font-semibold text-content-primary">
                {project.name}
              </h2>
              {project.description && (
                <p className="mt-0.5 truncate font-aeonik-fono text-xs text-content-muted">
                  {project.description}
                </p>
              )}
            </div>
          </div>

          {/* New Chat button */}
          <div className="relative z-10 flex-none p-2">
            <button
              onClick={handleNewChat}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg border p-3 text-sm',
                isDarkMode ? 'bg-surface-chat' : 'bg-white',
                isDarkMode
                  ? 'border-border-strong text-content-secondary hover:border-border-strong/80 hover:bg-surface-chat'
                  : 'border-border-subtle text-content-secondary hover:border-border-strong hover:bg-white',
              )}
            >
              <PlusIcon className="h-5 w-5 shrink-0" />
              <span className="leading-5">New Chat</span>
            </button>
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
              {loadingChats ? (
                <div className="py-8 text-center">
                  <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                  <p className="font-aeonik-fono text-sm text-content-muted">
                    Loading chats...
                  </p>
                </div>
              ) : chats.length === 0 ? (
                <div className="rounded-lg border border-border-subtle bg-surface-sidebar p-4 text-center">
                  <p className="text-sm text-content-muted">No chats yet</p>
                  <p className="mt-1 text-xs text-content-muted">
                    Start a new chat to begin
                  </p>
                </div>
              ) : (
                chats.map((chat) => (
                  <div key={chat.id} className="relative">
                    <div
                      onClick={() => handleChatSelect(chat.id)}
                      className={cn(
                        'group flex w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-3 text-left text-sm',
                        currentChatId === chat.id
                          ? isDarkMode
                            ? 'border-brand-accent-light/60 bg-surface-chat text-white'
                            : 'border-brand-accent-light/60 bg-white text-content-primary'
                          : isDarkMode
                            ? 'border-border-strong bg-surface-sidebar text-content-secondary hover:border-border-strong/80 hover:bg-surface-chat'
                            : 'border-border-subtle bg-surface-sidebar text-content-secondary hover:border-border-strong hover:bg-surface-sidebar',
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
                            <div className="truncate font-aeonik-fono text-sm font-medium">
                              {chat.title}
                            </div>
                            <div className="mt-1 text-xs text-content-muted">
                              {chat.messageCount} messages •{' '}
                              {formatRelativeTime(new Date(chat.updatedAt))}
                            </div>
                          </>
                        )}
                      </div>
                      {editingChatId !== chat.id && (
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
                            setDeletingChatId(null)
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Documents Section */}
          <div className="relative z-10 flex-none border-t border-border-subtle">
            <div className="px-3 py-2 sm:px-4 sm:py-3">
              <div className="flex items-center justify-between">
                <h3 className="font-aeonik-fono text-sm font-medium text-content-primary">
                  Documents ({projectDocuments.length})
                </h3>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={contextLoading}
                  className={cn(
                    'rounded p-1 transition-colors',
                    isDarkMode
                      ? 'text-emerald-400 hover:bg-surface-chat'
                      : 'text-emerald-600 hover:bg-surface-sidebar',
                    contextLoading && 'cursor-not-allowed opacity-50',
                  )}
                  title="Upload document"
                >
                  <DocumentPlusIcon className="h-4 w-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={contextLoading}
                  accept=".txt,.md,.json,.pdf,.docx,.xlsx,.pptx"
                />
              </div>
            </div>
            {projectDocuments.length > 0 && (
              <div className="max-h-32 overflow-y-auto px-2 pb-2">
                <div className="space-y-1">
                  {projectDocuments.map((doc) => (
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
                          isDarkMode ? 'text-emerald-400' : 'text-emerald-600',
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
                        onClick={() => removeDocument(doc.id)}
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
              </div>
            )}
          </div>

          {/* Project Settings Dropdown */}
          <div className="relative z-10 flex-none border-t border-border-subtle">
            <button
              onClick={() => setSettingsExpanded(!settingsExpanded)}
              className={cn(
                'flex w-full items-center justify-between px-4 py-3 text-sm transition-colors',
                isDarkMode
                  ? 'text-content-secondary hover:bg-surface-chat'
                  : 'text-content-secondary hover:bg-surface-sidebar',
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
              <div className="max-h-64 overflow-y-auto border-t border-border-subtle px-4 py-3">
                <div className="space-y-4">
                  {/* Project Name */}
                  <div>
                    <label className="mb-1 block font-aeonik text-xs font-medium text-content-secondary">
                      Project Name
                    </label>
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className={cn(
                        'w-full rounded-md border px-3 py-2 text-sm',
                        isDarkMode
                          ? 'border-border-strong bg-surface-chat text-content-secondary'
                          : 'border-border-subtle bg-white text-content-primary',
                        'focus:outline-none focus:ring-2 focus:ring-emerald-500',
                      )}
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="mb-1 block font-aeonik text-xs font-medium text-content-secondary">
                      Description
                    </label>
                    <textarea
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      placeholder="Brief description..."
                      rows={2}
                      className={cn(
                        'w-full resize-none rounded-md border px-3 py-2 text-sm',
                        isDarkMode
                          ? 'border-border-strong bg-surface-chat text-content-secondary placeholder:text-content-muted'
                          : 'border-border-subtle bg-white text-content-primary placeholder:text-content-muted',
                        'focus:outline-none focus:ring-2 focus:ring-emerald-500',
                      )}
                    />
                  </div>

                  {/* System Instructions */}
                  <div>
                    <label className="mb-1 block font-aeonik text-xs font-medium text-content-secondary">
                      System Instructions
                    </label>
                    <textarea
                      value={editedInstructions}
                      onChange={(e) => setEditedInstructions(e.target.value)}
                      placeholder="Custom instructions..."
                      rows={3}
                      className={cn(
                        'w-full resize-none rounded-md border px-3 py-2 font-mono text-xs',
                        isDarkMode
                          ? 'border-border-strong bg-surface-chat text-content-secondary placeholder:text-content-muted'
                          : 'border-border-subtle bg-white text-content-primary placeholder:text-content-muted',
                        'focus:outline-none focus:ring-2 focus:ring-emerald-500',
                      )}
                    />
                  </div>

                  {/* Save button */}
                  {hasUnsavedChanges && (
                    <button
                      onClick={handleSaveSettings}
                      disabled={isSaving}
                      className={cn(
                        'w-full rounded-md px-3 py-2 font-aeonik text-sm font-medium transition-colors',
                        'bg-emerald-600 text-white hover:bg-emerald-700',
                        isSaving && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                  )}

                  {/* Delete Project */}
                  <div className="border-t border-border-subtle pt-3">
                    {showDeleteConfirm ? (
                      <div
                        className={cn(
                          'rounded-md border p-3',
                          isDarkMode
                            ? 'border-red-500/30 bg-red-950/20'
                            : 'border-red-200 bg-red-50',
                        )}
                      >
                        <p className="mb-3 text-xs text-content-secondary">
                          Delete this project? This cannot be undone.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={handleDeleteProject}
                            disabled={isDeleting}
                            className={cn(
                              'flex-1 rounded-md px-3 py-1.5 text-xs font-medium',
                              'bg-red-600 text-white hover:bg-red-700',
                              isDeleting && 'cursor-not-allowed opacity-50',
                            )}
                          >
                            {isDeleting ? 'Deleting...' : 'Delete'}
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(false)}
                            className={cn(
                              'flex-1 rounded-md px-3 py-1.5 text-xs font-medium',
                              isDarkMode
                                ? 'bg-surface-chat text-content-secondary'
                                : 'bg-surface-sidebar text-content-secondary',
                            )}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className={cn(
                          'flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                          isDarkMode
                            ? 'border-red-500/30 text-red-400 hover:bg-red-950/20'
                            : 'border-red-200 text-red-600 hover:bg-red-50',
                        )}
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                        Delete Project
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
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
