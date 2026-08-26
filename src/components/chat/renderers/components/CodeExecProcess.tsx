import type { ToolCallState } from '@/components/chat/types'
import { memo, useMemo, useState } from 'react'
import { PiSpinner } from 'react-icons/pi'

interface CodeExecProcessProps {
  calls: ToolCallState[]
}

/**
 * How to say what each harness tool did. This renderer is the only layer that
 * knows a `bash` call is a command and a `view` call is a file, so the phrasing
 * lives here and an unlisted tool falls through to its own name.
 *
 * `failed` reads as a fragment for every tool but `bash`, whose failure copy is
 * a whole sentence -- hence its own bare form for a call that carried no
 * argument to name.
 */
const TOOL_COPY: Record<
  string,
  {
    running: string
    done: string
    failed: string
    failedBare?: string
    arg: string
    noun: string
    /** A command can run to any length; a path's tail is the useful part. */
    elide?: boolean
  }
> = {
  bash: {
    running: 'Running',
    done: 'Ran',
    failed: 'Command failed:',
    failedBare: 'Command failed',
    arg: 'command',
    noun: 'command',
    elide: true,
  },
  view: {
    running: 'Reading',
    done: 'Read',
    failed: 'Failed to read',
    arg: 'path',
    noun: 'file',
  },
  create: {
    running: 'Creating',
    done: 'Created',
    failed: 'Failed to create',
    arg: 'path',
    noun: 'file',
  },
  str_replace: {
    running: 'Editing',
    done: 'Edited',
    failed: 'Failed to edit',
    arg: 'path',
    noun: 'file',
  },
  insert: {
    running: 'Inserting into',
    done: 'Inserted into',
    failed: 'Failed to insert into',
    arg: 'path',
    noun: 'file',
  },
  present: {
    running: 'Presenting',
    done: 'Presented',
    failed: 'Failed to present',
    arg: 'path',
    noun: 'file',
  },
}

function getToolLabel(call: ToolCallState): string {
  const copy = TOOL_COPY[call.toolName]
  if (!copy) {
    if (call.status === 'failed') return `${call.toolName} failed`
    return call.status === 'running'
      ? `Running ${call.toolName}`
      : `Ran ${call.toolName}`
  }

  const verb =
    call.status === 'failed'
      ? copy.failed
      : call.status === 'running'
        ? copy.running
        : copy.done
  const subject = call.arguments?.[copy.arg]
  if (typeof subject !== 'string' || !subject) {
    return call.status === 'failed' && copy.failedBare
      ? copy.failedBare
      : `${verb} ${copy.noun}`
  }
  const shown =
    copy.elide && subject.length > 60 ? `${subject.slice(0, 57)}...` : subject
  return `${verb} \`${shown}\``
}

function getHeaderLabel(calls: ToolCallState[]): string {
  if (calls.length === 1) {
    return getToolLabel(calls[0])
  }
  const count = calls.length
  const anyRunning = calls.some((c) => c.status === 'running')
  if (anyRunning) {
    return `Running ${count} tools`
  }
  const failedCount = calls.reduce(
    (n, c) => (c.status === 'failed' ? n + 1 : n),
    0,
  )
  if (failedCount > 0) {
    return `Ran ${count} tools (${failedCount} failed)`
  }
  return `Ran ${count} tools`
}

function getDisplayContent(call: ToolCallState): string | null {
  // A failed file operation never touched the file, so echoing the arguments
  // it was given -- `file_text` above all -- would describe an edit that did
  // not happen. Every such tool is the one that names a `path`.
  if (call.status === 'failed' && TOOL_COPY[call.toolName]?.arg === 'path') {
    return null
  }
  switch (call.toolName) {
    case 'bash':
    case 'view':
    case 'str_replace':
    case 'insert':
      return call.output || null
    case 'present':
      // Also emitted as inline assistant content — avoid duplication.
      return null
    case 'create':
      return (
        (typeof call.arguments?.file_text === 'string'
          ? call.arguments.file_text
          : null) ||
        call.output ||
        null
      )
    default:
      return call.output || null
  }
}

function ToolCallRow({ call }: { call: ToolCallState }) {
  const label = getToolLabel(call)
  const isBash = call.toolName === 'bash'
  const isFailed = call.status === 'failed'
  const displayContent =
    call.status !== 'running' ? getDisplayContent(call) : null

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`flex items-start gap-2 text-sm ${isFailed ? 'text-destructive/80' : 'text-content-primary/70'}`}
      >
        {call.status === 'running' ? (
          <PiSpinner className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-content-primary/50" />
        ) : isFailed ? (
          <span className="mt-0.5 h-3.5 w-3.5 shrink-0 text-center text-xs text-destructive">
            !
          </span>
        ) : (
          <svg
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-content-primary/40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
        <span className="min-w-0 font-medium">{label}</span>
      </div>
      {displayContent && (
        <pre
          tabIndex={0}
          aria-label={`${label} output`}
          className={`ml-6 max-h-60 overflow-auto rounded-md px-3 py-2 text-xs leading-relaxed ${
            isBash
              ? 'bg-surface-chat-background font-mono text-content-primary/70'
              : 'bg-surface-chat-background text-content-primary/70'
          } ${isFailed ? 'border border-destructive/30' : ''}`}
        >
          {displayContent}
        </pre>
      )}
    </div>
  )
}

export const CodeExecProcess = memo(function CodeExecProcess({
  calls,
}: CodeExecProcessProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const anyRunning = useMemo(
    () => calls.some((c) => c.status === 'running'),
    [calls],
  )
  const allFailed = useMemo(
    () => calls.length > 0 && calls.every((c) => c.status === 'failed'),
    [calls],
  )
  const headerLabel = useMemo(() => getHeaderLabel(calls), [calls])

  if (calls.length === 0) return null

  // Render flat (no chevron) when no call has an expandable body.
  const hasBody = (c: ToolCallState): boolean => {
    if (c.status === 'running') return c.toolName !== 'present'
    return getDisplayContent(c) !== null
  }
  if (!calls.some(hasBody)) {
    return (
      <div className="-mx-1 flex w-full items-start gap-1.5 px-1 py-1">
        <span className="mt-[5px] h-3.5 w-3.5 shrink-0" aria-hidden="true">
          {anyRunning ? (
            <PiSpinner
              className="h-3.5 w-3.5 animate-spin text-content-primary/50"
              aria-hidden="true"
              focusable="false"
            />
          ) : allFailed ? (
            <span className="block h-3.5 w-3.5 text-center text-xs leading-[14px] text-destructive">
              !
            </span>
          ) : null}
        </span>
        <span
          className={`min-w-0 text-base font-medium ${allFailed ? 'text-destructive/80' : 'text-content-primary/50'}`}
        >
          {headerLabel}
        </span>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        aria-expanded={isExpanded}
        className="hover:bg-surface-secondary/50 group -mx-1 flex w-full cursor-pointer items-start gap-1.5 rounded-md px-1 py-1 text-left transition-colors"
      >
        <span className="mt-[5px] h-3.5 w-3.5 shrink-0" aria-hidden="true">
          {anyRunning ? (
            <PiSpinner
              className="h-3.5 w-3.5 animate-spin text-content-primary/50"
              aria-hidden="true"
              focusable="false"
            />
          ) : (
            <svg
              className={`h-3.5 w-3.5 transform text-content-primary/40 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
              focusable="false"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          )}
        </span>
        <span
          className={`min-w-0 text-base font-medium ${allFailed ? 'text-destructive/80' : 'text-content-primary/50'}`}
        >
          {headerLabel}
        </span>
      </button>

      <div
        inert={!isExpanded}
        className="grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="ml-2 flex flex-col gap-2 border-l-2 border-border-subtle py-2 pl-3 pr-1">
            {calls.map((call) => (
              <ToolCallRow key={call.id} call={call} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
})
