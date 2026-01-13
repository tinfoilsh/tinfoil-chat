'use client'

import type { Chat } from '@/components/chat/types'
import { cn } from '@/components/ui/utils'
import {
  ArrowLeftIcon,
  DocumentTextIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { useProject } from './project-context'
import { ProjectDocumentUpload } from './project-document-upload'

interface ProjectSidebarContentProps {
  isDarkMode: boolean
  projectChats: Chat[]
  currentChatId: string | null
  onChatSelect: (chatId: string) => void
  onNewChat: () => void
  onExitProject: () => void
  isPremium?: boolean
}

export function ProjectSidebarContent({
  isDarkMode,
  projectChats,
  currentChatId,
  onChatSelect,
  onNewChat,
  onExitProject,
  isPremium,
}: ProjectSidebarContentProps) {
  const { activeProject, projectDocuments, removeDocument, loading } =
    useProject()

  if (!activeProject) return null

  return (
    <div className="flex h-full flex-col">
      {/* Project header in sidebar */}
      <div className="flex-none border-b border-border-subtle p-3">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-aeonik text-sm font-semibold text-content-primary">
            {activeProject.name}
          </h3>
          <button
            onClick={onExitProject}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
              isDarkMode
                ? 'text-content-muted hover:bg-surface-chat hover:text-content-secondary'
                : 'text-content-muted hover:bg-surface-sidebar hover:text-content-secondary',
            )}
          >
            <ArrowLeftIcon className="h-3 w-3" />
            Exit Project
          </button>
        </div>

        {activeProject.description && (
          <p className="font-aeonik-fono text-xs text-content-muted">
            {activeProject.description}
          </p>
        )}
      </div>

      {/* Project chats section */}
      <div className="flex-none border-b border-border-subtle p-3">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-aeonik text-xs font-medium text-content-secondary">
            Project Chats
          </h4>
          <button
            onClick={onNewChat}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
              isDarkMode
                ? 'text-emerald-400 hover:bg-surface-chat'
                : 'text-emerald-600 hover:bg-surface-sidebar',
            )}
          >
            <PlusIcon className="h-3 w-3" />
            New
          </button>
        </div>

        <div className="max-h-48 space-y-1 overflow-y-auto">
          {projectChats.length === 0 ? (
            <p className="py-2 text-center font-aeonik-fono text-xs text-content-muted">
              No chats yet. Start a new chat!
            </p>
          ) : (
            projectChats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => onChatSelect(chat.id)}
                className={cn(
                  'w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                  currentChatId === chat.id
                    ? isDarkMode
                      ? 'bg-surface-chat text-content-primary'
                      : 'bg-white text-content-primary'
                    : isDarkMode
                      ? 'text-content-secondary hover:bg-surface-chat'
                      : 'text-content-secondary hover:bg-surface-sidebar',
                )}
              >
                <div className="truncate font-aeonik-fono">{chat.title}</div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Documents section */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-aeonik text-xs font-medium text-content-secondary">
            Documents
          </h4>
          <span className="font-aeonik-fono text-xs text-content-muted">
            {projectDocuments.length} file
            {projectDocuments.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="mb-3 space-y-1">
          {projectDocuments.length === 0 ? (
            <p className="py-2 text-center font-aeonik-fono text-xs text-content-muted">
              No documents uploaded yet.
            </p>
          ) : (
            projectDocuments.map((doc) => (
              <div
                key={doc.id}
                className={cn(
                  'group flex items-center justify-between rounded-md px-2 py-1.5',
                  isDarkMode
                    ? 'hover:bg-surface-chat'
                    : 'hover:bg-surface-sidebar',
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <DocumentTextIcon className="h-4 w-4 flex-shrink-0 text-content-muted" />
                  <div className="min-w-0">
                    <div className="truncate font-aeonik-fono text-xs text-content-secondary">
                      {doc.filename}
                    </div>
                    <div className="font-aeonik-fono text-[10px] text-content-muted">
                      {formatBytes(doc.sizeBytes)}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => removeDocument(doc.id)}
                  disabled={loading}
                  className={cn(
                    'rounded p-1 opacity-0 transition-all group-hover:opacity-100',
                    isDarkMode
                      ? 'text-content-muted hover:bg-surface-sidebar hover:text-red-400'
                      : 'text-content-muted hover:bg-white hover:text-red-500',
                    loading && 'cursor-not-allowed opacity-50',
                  )}
                  title="Remove document"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <ProjectDocumentUpload isDarkMode={isDarkMode} isPremium={isPremium} />
      </div>

      {/* Project memory preview */}
      {activeProject.memory && activeProject.memory.length > 0 && (
        <div className="flex-none border-t border-border-subtle p-3">
          <h4 className="mb-1 font-aeonik text-xs font-medium text-content-secondary">
            Project Memory ({activeProject.memory.length} facts)
          </h4>
          <p className="line-clamp-3 font-aeonik-fono text-xs text-content-muted">
            {activeProject.memory
              .slice(0, 3)
              .map((f) => f.fact)
              .join(' • ')}
          </p>
        </div>
      )}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1,
  )
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
