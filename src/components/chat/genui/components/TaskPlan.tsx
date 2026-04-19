import { Progress } from '@/components/ui/progress'
import { AlertTriangle, CheckCircle2, Circle, CircleDot } from 'lucide-react'
import { coerceArray } from './input-coercion'

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked'

interface TaskItem {
  title: string
  description?: string
  status?: TaskStatus
}

interface TaskPlanProps {
  title?: string
  summary?: string
  status?: TaskStatus
  progress?: number
  tasks: unknown
  nextStep?: string
}

const STATUS_META = {
  pending: {
    icon: Circle,
    iconClass: 'text-content-muted',
    badgeClass:
      'border-border-subtle bg-surface-chat-background text-content-muted',
    label: 'Pending',
  },
  in_progress: {
    icon: CircleDot,
    iconClass: 'text-blue-500',
    badgeClass:
      'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
    label: 'In progress',
  },
  completed: {
    icon: CheckCircle2,
    iconClass: 'text-green-500',
    badgeClass:
      'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400',
    label: 'Completed',
  },
  blocked: {
    icon: AlertTriangle,
    iconClass: 'text-red-500',
    badgeClass:
      'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
    label: 'Blocked',
  },
} as const

function clampProgress(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function getTasks(tasks: unknown): TaskItem[] {
  return coerceArray<TaskItem>(tasks)
}

function getStatusCounts(tasks: TaskItem[]) {
  return tasks.reduce(
    (counts, task) => {
      const status = task.status ?? 'pending'
      counts[status] += 1
      return counts
    },
    {
      pending: 0,
      in_progress: 0,
      completed: 0,
      blocked: 0,
    },
  )
}

function getOverallStatus(
  explicitStatus: TaskStatus | undefined,
  tasks: TaskItem[],
): TaskStatus {
  if (explicitStatus) return explicitStatus

  const counts = getStatusCounts(tasks)
  if (counts.blocked > 0) return 'blocked'
  if (counts.in_progress > 0) return 'in_progress'
  if (tasks.length > 0 && counts.completed === tasks.length) return 'completed'
  return 'pending'
}

function getDerivedProgress(
  explicitProgress: number | undefined,
  tasks: TaskItem[],
) {
  if (typeof explicitProgress === 'number')
    return clampProgress(explicitProgress)
  if (tasks.length === 0) return 0

  const counts = getStatusCounts(tasks)
  return clampProgress((counts.completed / tasks.length) * 100)
}

export function TaskPlan({
  title,
  summary,
  status,
  progress,
  tasks,
  nextStep,
}: TaskPlanProps) {
  const items = getTasks(tasks)
  const overallStatus = getOverallStatus(status, items)
  const overallMeta = STATUS_META[overallStatus]
  const counts = getStatusCounts(items)
  const percent = getDerivedProgress(progress, items)

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border-subtle bg-surface-card">
      <div className="border-b border-border-subtle bg-surface-chat-background px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-content-primary">
              {title ?? 'Plan'}
            </p>
            {summary && (
              <p className="mt-1 text-sm text-content-muted">{summary}</p>
            )}
          </div>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${overallMeta.badgeClass}`}
          >
            {overallMeta.label}
          </span>
        </div>
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-content-muted">
            <span>Overall progress</span>
            <span>{Math.round(percent)}%</span>
          </div>
          <Progress value={percent} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-content-muted">
          <span>{counts.completed} completed</span>
          <span>·</span>
          <span>{counts.in_progress} in progress</span>
          <span>·</span>
          <span>{counts.pending} pending</span>
          {counts.blocked > 0 && (
            <>
              <span>·</span>
              <span>{counts.blocked} blocked</span>
            </>
          )}
        </div>
      </div>
      <div className="space-y-3 p-4">
        {items.map((task, index) => {
          const taskStatus = task.status ?? 'pending'
          const meta = STATUS_META[taskStatus]
          const Icon = meta.icon

          return (
            <div key={index} className="flex gap-3">
              <div className="mt-0.5 shrink-0">
                <Icon className={`h-5 w-5 ${meta.iconClass}`} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-content-primary">
                  {task.title}
                </p>
                {task.description && (
                  <p className="mt-0.5 text-xs text-content-muted">
                    {task.description}
                  </p>
                )}
              </div>
            </div>
          )
        })}
        {nextStep && (
          <div className="rounded-md border border-border-subtle bg-surface-chat-background px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-content-muted">
              Next step
            </p>
            <p className="mt-1 text-sm text-content-primary">{nextStep}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export function validateTaskPlanProps(props: Record<string, unknown>): boolean {
  const tasks = getTasks(props.tasks)

  return (
    tasks.length > 0 &&
    tasks.every(
      (task) =>
        task !== null &&
        typeof task === 'object' &&
        typeof task.title === 'string',
    )
  )
}
