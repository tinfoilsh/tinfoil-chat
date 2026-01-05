'use client'

import { cn } from '@/components/ui/utils'
import { useProjects } from '@/hooks/use-projects'
import type { Project } from '@/types/project'
import {
  ArrowLeftIcon,
  FolderIcon,
  FolderPlusIcon,
} from '@heroicons/react/24/outline'
import { motion } from 'framer-motion'
import { useCallback, useState } from 'react'
import { useProject } from './project-context'

interface ProjectSelectorViewProps {
  isDarkMode: boolean
  onBack: () => void
  onSelectProject: (project: Project) => void
}

export function ProjectSelectorView({
  isDarkMode,
  onBack,
  onSelectProject,
}: ProjectSelectorViewProps) {
  const { projects, loading: loadingList, hasMore, loadMore } = useProjects()
  const { createProject, loading: loadingAction } = useProject()
  const [view, setView] = useState<'list' | 'create'>('list')
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDescription, setNewProjectDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleCreateProject = useCallback(async () => {
    if (!newProjectName.trim()) {
      setError('Project name is required')
      return
    }

    setError(null)
    try {
      const project = await createProject({
        name: newProjectName.trim(),
        description: newProjectDescription.trim(),
      })
      setNewProjectName('')
      setNewProjectDescription('')
      setView('list')
      onSelectProject(project)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    }
  }, [newProjectName, newProjectDescription, createProject, onSelectProject])

  const handleSelectProject = useCallback(
    (project: Project) => {
      onSelectProject(project)
    },
    [onSelectProject],
  )

  const handleBack = useCallback(() => {
    if (view === 'create') {
      setView('list')
      setNewProjectName('')
      setNewProjectDescription('')
      setError(null)
    } else {
      onBack()
    }
  }, [view, onBack])

  return (
    <motion.div
      className="w-full"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        ease: 'easeOut',
      }}
    >
      <div className="flex w-full justify-center">
        <div className="w-full max-w-2xl">
          <motion.div
            className="mb-8 flex items-center gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.4,
              ease: 'easeOut',
              delay: 0.1,
            }}
          >
            <button
              onClick={handleBack}
              className={cn(
                'rounded-md p-1.5 transition-colors',
                isDarkMode
                  ? 'text-content-muted hover:bg-surface-chat hover:text-content-secondary'
                  : 'text-content-muted hover:bg-surface-sidebar hover:text-content-secondary',
              )}
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <h1 className="text-2xl font-medium tracking-tight text-content-primary md:text-3xl">
              {view === 'list' ? 'Projects' : 'New Project'}
            </h1>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: 0.4,
              ease: 'easeOut',
              delay: 0.2,
            }}
          >
            {view === 'list' ? (
              <div className="space-y-4">
                <button
                  onClick={() => setView('create')}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border-2 border-dashed p-5 transition-colors',
                    isDarkMode
                      ? 'border-emerald-500/40 text-emerald-400 hover:border-emerald-500/60 hover:bg-emerald-950/20'
                      : 'border-emerald-500/40 text-emerald-600 hover:border-emerald-500/60 hover:bg-emerald-50/50',
                  )}
                >
                  <FolderPlusIcon className="h-7 w-7" />
                  <span className="font-aeonik text-lg font-medium">
                    Create New Project
                  </span>
                </button>

                {loadingList && projects.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                    <p className="font-aeonik-fono text-sm text-content-muted">
                      Loading projects...
                    </p>
                  </div>
                ) : projects.length === 0 ? (
                  <div className="py-12 text-center">
                    <FolderIcon className="mx-auto mb-3 h-12 w-12 text-content-muted" />
                    <p className="font-aeonik-fono text-base text-content-muted">
                      No projects yet
                    </p>
                    <p className="font-aeonik-fono text-sm text-content-muted">
                      Create your first project to get started
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {projects.map((project) => (
                      <button
                        key={project.id}
                        onClick={() => handleSelectProject(project)}
                        disabled={loadingAction}
                        className={cn(
                          'flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-colors',
                          isDarkMode
                            ? 'border-border-strong bg-surface-chat hover:bg-surface-chat/80'
                            : 'border-border-subtle bg-white hover:bg-surface-sidebar/50',
                          loadingAction && 'cursor-not-allowed opacity-50',
                        )}
                      >
                        <FolderIcon
                          className={cn(
                            'mt-0.5 h-6 w-6 flex-shrink-0',
                            isDarkMode
                              ? 'text-emerald-400'
                              : 'text-emerald-600',
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-aeonik text-lg font-medium text-content-primary">
                            {project.name}
                          </div>
                          {project.description && (
                            <div className="mt-1 truncate font-aeonik-fono text-sm text-content-muted">
                              {project.description}
                            </div>
                          )}
                          <div className="mt-2 font-aeonik-fono text-xs text-content-muted">
                            Updated{' '}
                            {formatRelativeTime(new Date(project.updatedAt))}
                          </div>
                        </div>
                      </button>
                    ))}

                    {hasMore && (
                      <button
                        onClick={loadMore}
                        disabled={loadingList}
                        className={cn(
                          'w-full rounded-lg py-3 text-center font-aeonik-fono text-sm transition-colors',
                          isDarkMode
                            ? 'text-content-muted hover:text-content-secondary'
                            : 'text-content-muted hover:text-content-secondary',
                          loadingList && 'cursor-not-allowed opacity-50',
                        )}
                      >
                        {loadingList ? 'Loading...' : 'Load more'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <label className="mb-2 block font-aeonik text-sm font-medium text-content-secondary">
                    Project Name
                  </label>
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="My Project"
                    autoFocus
                    className={cn(
                      'w-full rounded-xl border px-4 py-3 text-base',
                      isDarkMode
                        ? 'border-border-strong bg-surface-chat text-content-secondary placeholder:text-content-muted'
                        : 'border-border-subtle bg-white text-content-primary placeholder:text-content-muted',
                      'focus:outline-none focus:ring-2 focus:ring-emerald-500',
                    )}
                  />
                </div>

                <div>
                  <label className="mb-2 block font-aeonik text-sm font-medium text-content-secondary">
                    Description (optional)
                  </label>
                  <textarea
                    value={newProjectDescription}
                    onChange={(e) => setNewProjectDescription(e.target.value)}
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

                {error && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3">
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => {
                      setView('list')
                      setError(null)
                    }}
                    className={cn(
                      'rounded-lg px-5 py-2.5 font-aeonik text-sm font-medium transition-colors',
                      isDarkMode
                        ? 'text-content-secondary hover:bg-surface-chat'
                        : 'text-content-secondary hover:bg-surface-sidebar',
                    )}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateProject}
                    disabled={loadingAction || !newProjectName.trim()}
                    className={cn(
                      'rounded-lg px-5 py-2.5 font-aeonik text-sm font-medium transition-colors',
                      'bg-emerald-600 text-white hover:bg-emerald-700',
                      (loadingAction || !newProjectName.trim()) &&
                        'cursor-not-allowed opacity-50',
                    )}
                  >
                    {loadingAction ? 'Creating...' : 'Create Project'}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
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
