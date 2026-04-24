import { CONSTANTS } from '@/components/chat/constants'
import { LoadingDots } from '@/components/loading-dots'
import { logError } from '@/utils/error-handling'
import React, { memo, useEffect, useRef, useState } from 'react'
import { renderGenUIToolCall } from './registry'
import type { GenUIToolCall } from './types'

interface GenUIToolCallRendererProps {
  toolCalls: GenUIToolCall[]
  isStreaming: boolean
  isDarkMode?: boolean
}

function resolveInput(tc: GenUIToolCall): Record<string, unknown> | null {
  if (tc.input && typeof tc.input === 'object' && !Array.isArray(tc.input)) {
    return tc.input as Record<string, unknown>
  }
  if (!tc.arguments) return null
  try {
    const parsed = JSON.parse(tc.arguments)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // Arguments still streaming, JSON incomplete
  }
  return null
}

/**
 * Tracks the earliest moment each tool-call id became visible, so we can
 * enforce a minimum placeholder duration even when providers stream tool
 * calls sequentially and each one finalizes before the next begins.
 */
function usePlaceholderRelease(
  toolCalls: GenUIToolCall[],
  minDurationMs: number,
): Set<string> {
  const firstSeenAtRef = useRef<Map<string, number>>(new Map())
  const [releasedIds, setReleasedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const now = Date.now()
    const firstSeen = firstSeenAtRef.current
    const timers: ReturnType<typeof setTimeout>[] = []

    for (const tc of toolCalls) {
      if (!firstSeen.has(tc.id)) {
        firstSeen.set(tc.id, now)
      }

      if (releasedIds.has(tc.id)) continue

      const shownAt = firstSeen.get(tc.id) ?? now
      const elapsed = now - shownAt
      const remaining = Math.max(0, minDurationMs - elapsed)
      const id = tc.id

      const timer = setTimeout(() => {
        setReleasedIds((prev) => {
          if (prev.has(id)) return prev
          const next = new Set(prev)
          next.add(id)
          return next
        })
      }, remaining)
      timers.push(timer)
    }

    return () => {
      for (const t of timers) clearTimeout(t)
    }
  }, [toolCalls, minDurationMs, releasedIds])

  return releasedIds
}

export const GenUIToolCallRenderer = memo(function GenUIToolCallRenderer({
  toolCalls,
  isStreaming,
  isDarkMode,
}: GenUIToolCallRendererProps) {
  const releasedIds = usePlaceholderRelease(
    toolCalls,
    CONSTANTS.GENUI_PLACEHOLDER_MIN_DURATION_MS,
  )

  return (
    <React.Fragment>
      {toolCalls.map((tc) => {
        const input = resolveInput(tc)
        const canShowComponent = !isStreaming || releasedIds.has(tc.id)

        if (input && canShowComponent) {
          const rendered = renderGenUIToolCall(tc.name, input, { isDarkMode })
          if (rendered) {
            return (
              <div key={tc.id} className="my-4">
                {rendered}
              </div>
            )
          }
          if (!isStreaming) {
            logError(
              'GenUI render failed',
              new Error(`Unable to render component: ${tc.name}`),
              {
                component: 'GenUIToolCallRenderer',
                action: 'render',
                metadata: { toolName: tc.name },
              },
            )
            return (
              <div
                key={tc.id}
                className="my-4 rounded-lg border border-border-subtle bg-transparent px-4 py-3 text-sm text-content-muted"
              >
                Unable to render component: {tc.name}
              </div>
            )
          }
        }

        if (isStreaming) {
          return (
            <div
              key={tc.id}
              className="my-4 flex h-12 items-center gap-2 rounded-lg border border-border-subtle bg-transparent px-4"
            >
              <span className="text-sm font-medium text-content-primary">
                Generating component
              </span>
              <LoadingDots />
            </div>
          )
        }

        return null
      })}
    </React.Fragment>
  )
})
