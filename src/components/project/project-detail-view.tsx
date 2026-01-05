'use client'

import { cn } from '@/components/ui/utils'
import { projectStorage } from '@/services/cloud/project-storage'
import { encryptionService } from '@/services/encryption/encryption-service'
import type { Project } from '@/types/project'
import { useAuth } from '@clerk/nextjs'
import {
  ArrowLeftIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  DocumentIcon,
  DocumentPlusIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { useProject } from './project-context'

interface ProjectDetailViewProps {
  project: Project
  isDarkMode: boolean
  onBack: () => void
  onStartChat: () => void
}

interface DecryptedChat {
  id: string
  title: string
  messageCount: number
  updatedAt: string
}

export function ProjectDetailView({
  project,
  isDarkMode,
  onBack,
  onStartChat,
}: ProjectDetailViewProps) {
  const { getToken } = useAuth()
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
  const [activeTab, setActiveTab] = useState<'chats' | 'files' | 'settings'>(
    'chats',
  )
  const [isEditingName, setIsEditingName] = useState(false)
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

  useEffect(() => {
    if (getToken) {
      projectStorage.setTokenGetter(getToken)
    }
  }, [getToken])

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

  const handleSaveSettings = useCallback(async () => {
    setIsSaving(true)
    try {
      await updateProject(project.id, {
        name: editedName,
        description: editedDescription,
        systemInstructions: editedInstructions,
      })
      setIsEditingName(false)
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
      onBack()
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }, [project.id, deleteProject, onBack])

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

  return (
    <motion.div
      className="flex h-full w-full flex-col"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div className="flex flex-1 overflow-hidden">
        {/* Main content area */}
        <div className="flex flex-1 flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-border-subtle px-6 py-4">
            <button
              onClick={onBack}
              className={cn(
                'rounded-md p-1.5 transition-colors',
                isDarkMode
                  ? 'text-content-muted hover:bg-surface-chat hover:text-content-secondary'
                  : 'text-content-muted hover:bg-surface-sidebar hover:text-content-secondary',
              )}
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>

            <div className="flex flex-1 items-center gap-2">
              {isEditingName ? (
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onBlur={() => {
                    if (editedName !== project.name) {
                      handleSaveSettings()
                    } else {
                      setIsEditingName(false)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveSettings()
                    } else if (e.key === 'Escape') {
                      setEditedName(project.name)
                      setIsEditingName(false)
                    }
                  }}
                  autoFocus
                  className={cn(
                    'rounded-md border px-2 py-1 text-xl font-medium',
                    isDarkMode
                      ? 'border-border-strong bg-surface-chat text-content-primary'
                      : 'border-border-subtle bg-white text-content-primary',
                    'focus:outline-none focus:ring-2 focus:ring-emerald-500',
                  )}
                />
              ) : (
                <h1
                  className="cursor-pointer text-xl font-medium text-content-primary hover:text-emerald-600"
                  onClick={() => setIsEditingName(true)}
                >
                  {project.name}
                </h1>
              )}
              <button
                onClick={() => setIsEditingName(true)}
                className="rounded p-1 text-content-muted hover:text-content-secondary"
              >
                <PencilIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border-subtle px-6">
            <button
              onClick={() => setActiveTab('chats')}
              className={cn(
                'border-b-2 px-4 py-3 font-aeonik text-sm font-medium transition-colors',
                activeTab === 'chats'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-content-muted hover:text-content-secondary',
              )}
            >
              <span className="flex items-center gap-2">
                <ChatBubbleLeftRightIcon className="h-4 w-4" />
                Chats
              </span>
            </button>
            <button
              onClick={() => setActiveTab('files')}
              className={cn(
                'border-b-2 px-4 py-3 font-aeonik text-sm font-medium transition-colors',
                activeTab === 'files'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-content-muted hover:text-content-secondary',
              )}
            >
              <span className="flex items-center gap-2">
                <DocumentIcon className="h-4 w-4" />
                Files
                {projectDocuments.length > 0 && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    {projectDocuments.length}
                  </span>
                )}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={cn(
                'border-b-2 px-4 py-3 font-aeonik text-sm font-medium transition-colors',
                activeTab === 'settings'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-content-muted hover:text-content-secondary',
              )}
            >
              <span className="flex items-center gap-2">
                <Cog6ToothIcon className="h-4 w-4" />
                Settings
              </span>
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'chats' && (
              <div className="space-y-4">
                {/* Start new chat button */}
                <button
                  onClick={onStartChat}
                  className={cn(
                    'flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 transition-colors',
                    isDarkMode
                      ? 'border-emerald-500/40 text-emerald-400 hover:border-emerald-500/60 hover:bg-emerald-950/20'
                      : 'border-emerald-500/40 text-emerald-600 hover:border-emerald-500/60 hover:bg-emerald-50/50',
                  )}
                >
                  <ChatBubbleLeftRightIcon className="h-5 w-5" />
                  <span className="font-aeonik font-medium">
                    Start New Chat
                  </span>
                </button>

                {/* Chats list */}
                {loadingChats ? (
                  <div className="py-8 text-center">
                    <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                    <p className="font-aeonik-fono text-sm text-content-muted">
                      Loading chats...
                    </p>
                  </div>
                ) : chats.length === 0 ? (
                  <div className="py-8 text-center">
                    <ChatBubbleLeftRightIcon className="mx-auto mb-2 h-10 w-10 text-content-muted" />
                    <p className="font-aeonik-fono text-sm text-content-muted">
                      No chats yet
                    </p>
                    <p className="font-aeonik-fono text-xs text-content-muted">
                      Start a new chat to begin
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {chats.map((chat) => (
                      <button
                        key={chat.id}
                        className={cn(
                          'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                          isDarkMode
                            ? 'border-border-strong bg-surface-chat hover:bg-surface-chat/80'
                            : 'border-border-subtle bg-white hover:bg-surface-sidebar/50',
                        )}
                      >
                        <ChatBubbleLeftRightIcon
                          className={cn(
                            'mt-0.5 h-5 w-5 flex-shrink-0',
                            isDarkMode
                              ? 'text-emerald-400'
                              : 'text-emerald-600',
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-aeonik font-medium text-content-primary">
                            {chat.title}
                          </div>
                          <div className="mt-1 font-aeonik-fono text-xs text-content-muted">
                            {chat.messageCount} messages •{' '}
                            {formatRelativeTime(new Date(chat.updatedAt))}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'files' && (
              <div className="space-y-4">
                {/* Upload button */}
                <label
                  className={cn(
                    'flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 transition-colors',
                    isDarkMode
                      ? 'border-emerald-500/40 text-emerald-400 hover:border-emerald-500/60 hover:bg-emerald-950/20'
                      : 'border-emerald-500/40 text-emerald-600 hover:border-emerald-500/60 hover:bg-emerald-50/50',
                    contextLoading && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <DocumentPlusIcon className="h-5 w-5" />
                  <span className="font-aeonik font-medium">
                    {contextLoading ? 'Uploading...' : 'Upload File'}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={contextLoading}
                    accept=".txt,.md,.json,.pdf,.docx,.xlsx,.pptx"
                  />
                </label>

                {/* Files list */}
                {projectDocuments.length === 0 ? (
                  <div className="py-8 text-center">
                    <DocumentIcon className="mx-auto mb-2 h-10 w-10 text-content-muted" />
                    <p className="font-aeonik-fono text-sm text-content-muted">
                      No files yet
                    </p>
                    <p className="font-aeonik-fono text-xs text-content-muted">
                      Upload files to include in project context
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {projectDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className={cn(
                          'flex items-start gap-3 rounded-lg border p-3',
                          isDarkMode
                            ? 'border-border-strong bg-surface-chat'
                            : 'border-border-subtle bg-white',
                        )}
                      >
                        <DocumentIcon
                          className={cn(
                            'mt-0.5 h-5 w-5 flex-shrink-0',
                            isDarkMode
                              ? 'text-emerald-400'
                              : 'text-emerald-600',
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-aeonik font-medium text-content-primary">
                            {doc.filename}
                          </div>
                          <div className="mt-1 font-aeonik-fono text-xs text-content-muted">
                            {formatFileSize(doc.sizeBytes)}
                          </div>
                        </div>
                        <button
                          onClick={() => removeDocument(doc.id)}
                          disabled={contextLoading}
                          className={cn(
                            'rounded p-1 transition-colors',
                            isDarkMode
                              ? 'text-content-muted hover:bg-red-900/20 hover:text-red-400'
                              : 'text-content-muted hover:bg-red-50 hover:text-red-600',
                            contextLoading && 'cursor-not-allowed opacity-50',
                          )}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="space-y-6">
                {/* Description */}
                <div>
                  <label className="mb-2 block font-aeonik text-sm font-medium text-content-secondary">
                    Description
                  </label>
                  <textarea
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    placeholder="Brief description of your project..."
                    rows={3}
                    className={cn(
                      'w-full resize-none rounded-xl border px-4 py-3 text-base',
                      isDarkMode
                        ? 'border-border-strong bg-surface-chat text-content-secondary placeholder:text-content-muted'
                        : 'border-border-subtle bg-white text-content-primary placeholder:text-content-muted',
                      'focus:outline-none focus:ring-2 focus:ring-emerald-500',
                    )}
                  />
                </div>

                {/* System Instructions */}
                <div>
                  <label className="mb-2 block font-aeonik text-sm font-medium text-content-secondary">
                    System Instructions
                  </label>
                  <textarea
                    value={editedInstructions}
                    onChange={(e) => setEditedInstructions(e.target.value)}
                    placeholder="Custom instructions for this project..."
                    rows={6}
                    className={cn(
                      'w-full resize-none rounded-xl border px-4 py-3 font-mono text-sm',
                      isDarkMode
                        ? 'border-border-strong bg-surface-chat text-content-secondary placeholder:text-content-muted'
                        : 'border-border-subtle bg-white text-content-primary placeholder:text-content-muted',
                      'focus:outline-none focus:ring-2 focus:ring-emerald-500',
                    )}
                  />
                </div>

                {/* Save button */}
                {(editedDescription !== project.description ||
                  editedInstructions !== project.systemInstructions) && (
                  <button
                    onClick={handleSaveSettings}
                    disabled={isSaving}
                    className={cn(
                      'rounded-lg px-5 py-2.5 font-aeonik text-sm font-medium transition-colors',
                      'bg-emerald-600 text-white hover:bg-emerald-700',
                      isSaving && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                )}

                {/* Danger zone */}
                <div className="mt-8 border-t border-border-subtle pt-6">
                  <h3 className="mb-4 font-aeonik text-sm font-medium text-red-600 dark:text-red-400">
                    Danger Zone
                  </h3>
                  {showDeleteConfirm ? (
                    <div
                      className={cn(
                        'rounded-xl border p-4',
                        isDarkMode
                          ? 'border-red-500/30 bg-red-950/20'
                          : 'border-red-200 bg-red-50',
                      )}
                    >
                      <p className="mb-4 text-sm text-content-secondary">
                        Are you sure you want to delete this project? This
                        action cannot be undone.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleDeleteProject}
                          disabled={isDeleting}
                          className={cn(
                            'rounded-lg px-4 py-2 font-aeonik text-sm font-medium',
                            'bg-red-600 text-white hover:bg-red-700',
                            isDeleting && 'cursor-not-allowed opacity-50',
                          )}
                        >
                          {isDeleting ? 'Deleting...' : 'Yes, Delete Project'}
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
                          className={cn(
                            'rounded-lg px-4 py-2 font-aeonik text-sm font-medium',
                            isDarkMode
                              ? 'text-content-secondary hover:bg-surface-chat'
                              : 'text-content-secondary hover:bg-surface-sidebar',
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
                        'flex items-center gap-2 rounded-lg border px-4 py-2 font-aeonik text-sm font-medium transition-colors',
                        isDarkMode
                          ? 'border-red-500/30 text-red-400 hover:bg-red-950/20'
                          : 'border-red-200 text-red-600 hover:bg-red-50',
                      )}
                    >
                      <TrashIcon className="h-4 w-4" />
                      Delete Project
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'just now'

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
