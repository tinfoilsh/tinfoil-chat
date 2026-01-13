'use client'

import type { Chat } from '@/components/chat/types'
import { cn } from '@/components/ui/utils'
import type { Fact } from '@/types/memory'
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  DocumentTextIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { LuBrain } from 'react-icons/lu'
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
  const {
    activeProject,
    projectDocuments,
    removeDocument,
    updateProjectMemory,
    loading,
  } = useProject()

  const [memoryExpanded, setMemoryExpanded] = useState(false)
  const [memoryText, setMemoryText] = useState('')
  const [memoryEdited, setMemoryEdited] = useState(false)

  const memoryFacts = useMemo(
    () => activeProject?.memory || [],
    [activeProject?.memory],
  )
  const activeProjectId = activeProject?.id

  useEffect(() => {
    if (activeProjectId && !memoryEdited) {
      setMemoryText(memoryFacts.map((f) => f.fact).join('\n'))
    }
  }, [activeProjectId, memoryFacts, memoryEdited])

  const handleMemoryChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setMemoryText(e.target.value)
      setMemoryEdited(true)
    },
    [],
  )

  const handleMemorySave = useCallback(async () => {
    if (!memoryEdited || !activeProject) return

    const newLines = memoryText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    const existingFacts = activeProject.memory || []
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
  }, [memoryEdited, memoryText, activeProject, updateProjectMemory])

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

      {/* Memory section */}
      <div className="flex-none border-t border-border-subtle">
        <button
          onClick={() => setMemoryExpanded(!memoryExpanded)}
          className={cn(
            'flex w-full items-center justify-between p-3 text-left transition-colors',
            isDarkMode ? 'hover:bg-surface-chat' : 'hover:bg-surface-sidebar',
          )}
        >
          <div className="flex items-center gap-2">
            <LuBrain className="h-4 w-4 text-content-muted" />
            <h4 className="font-aeonik text-xs font-medium text-content-secondary">
              Memory
            </h4>
            {memoryFacts.length > 0 && (
              <span className="font-aeonik-fono text-xs text-content-muted">
                ({memoryFacts.length})
              </span>
            )}
          </div>
          <ChevronDownIcon
            className={cn(
              'h-4 w-4 text-content-muted transition-transform',
              memoryExpanded && 'rotate-180',
            )}
          />
        </button>

        {memoryExpanded && (
          <div className="px-3 pb-3">
            {memoryFacts.length === 0 ? (
              <p className="py-2 text-center font-aeonik-fono text-xs text-content-muted">
                No memory yet. Memory will appear here as you have
                conversations.
              </p>
            ) : (
              <>
                <textarea
                  value={memoryText}
                  onChange={handleMemoryChange}
                  onBlur={handleMemorySave}
                  placeholder="Add facts about this project (one per line)..."
                  rows={6}
                  className={cn(
                    'w-full resize-none rounded-md border px-2 py-1.5 font-aeonik-fono text-xs',
                    isDarkMode
                      ? 'border-border-strong bg-surface-chat text-content-secondary placeholder:text-content-muted'
                      : 'border-border-subtle bg-white text-content-primary placeholder:text-content-muted',
                    'focus:outline-none focus:ring-1 focus:ring-emerald-500',
                  )}
                />
                <p className="mt-1 font-aeonik-fono text-[10px] text-content-muted">
                  One fact per line. Changes save on blur.
                </p>
              </>
            )}
          </div>
        )}
      </div>
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
