import type { ToolCallState } from '@/components/chat/types'
import { memo, useMemo, useState } from 'react'
import { PiSpinner } from 'react-icons/pi'

interface ToolCallProcessProps {
  calls: ToolCallState[]
}

function getToolLabel(call: ToolCallState): string {
  const name = call.toolName
  switch (name) {
    case 'bash': {
      const cmd = call.arguments?.command
      if (typeof cmd === 'string') {
        const short = cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd
        return call.status === 'running'
          ? `Running \`${short}\``
          : `Ran \`${short}\``
      }
      return call.status === 'running' ? 'Running command' : 'Ran command'
    }
    case 'view': {
      const path = call.arguments?.path
      if (typeof path === 'string') {
        return call.status === 'running'
          ? `Reading \`${path}\``
          : `Read \`${path}\``
      }
      return call.status === 'running' ? 'Reading file' : 'Read file'
    }
    case 'str_replace': {
      const path = call.arguments?.path
      if (typeof path === 'string') {
        return call.status === 'running'
          ? `Editing \`${path}\``
          : `Edited \`${path}\``
      }
      return call.status === 'running' ? 'Editing file' : 'Edited file'
    }
    case 'create': {
      const path = call.arguments?.path
      if (typeof path === 'string') {
        return call.status === 'running'
          ? `Creating \`${path}\``
          : `Created \`${path}\``
      }
      return call.status === 'running' ? 'Creating file' : 'Created file'
    }
    case 'insert': {
      const path = call.arguments?.path
      if (typeof path === 'string') {
        return call.status === 'running'
          ? `Inserting into \`${path}\``
          : `Inserted into \`${path}\``
      }
      return call.status === 'running'
        ? 'Inserting into file'
        : 'Inserted into file'
    }
    default:
      return call.status === 'running' ? `Running ${name}` : `Ran ${name}`
  }
}

function getHeaderLabel(calls: ToolCallState[]): string {
  const anyRunning = calls.some((c) => c.status === 'running')
  if (calls.length === 1) {
    return getToolLabel(calls[0])
  }
  const count = calls.length
  if (anyRunning) {
    return `Running ${count} tools`
  }
  return `Ran ${count} tools`
}

function ToolCallRow({ call }: { call: ToolCallState }) {
  const label = getToolLabel(call)
  const isBash = call.toolName === 'bash'
  const hasOutput = !!call.output

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2 text-sm text-content-primary/70">
        {call.status === 'running' ? (
          <PiSpinner className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-content-primary/50" />
        ) : call.status === 'failed' ? (
          <span className="mt-0.5 h-3.5 w-3.5 shrink-0 text-center text-xs text-red-500">
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
      {hasOutput && (
        <pre
          className={`ml-6 overflow-x-auto rounded-md px-3 py-2 text-xs leading-relaxed ${
            isBash
              ? 'bg-surface-chat-background font-mono text-content-primary/70'
              : 'bg-surface-chat-background text-content-primary/70'
          } ${call.status === 'failed' ? 'border border-red-500/20' : ''}`}
        >
          {call.output}
        </pre>
      )}
    </div>
  )
}

export const ToolCallProcess = memo(function ToolCallProcess({
  calls,
}: ToolCallProcessProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const anyRunning = useMemo(
    () => calls.some((c) => c.status === 'running'),
    [calls],
  )
  const headerLabel = useMemo(() => getHeaderLabel(calls), [calls])

  if (calls.length === 0) return null

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
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
        <span className="min-w-0 text-base font-medium text-content-primary/50">
          {headerLabel}
        </span>
      </button>

      <div
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
