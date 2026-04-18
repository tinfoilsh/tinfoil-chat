import { LoadingDots } from '@/components/loading-dots'
import { logError } from '@/utils/error-handling'
import { memo } from 'react'
import { renderGenUIToolCall } from './registry'
import type { GenUIToolCall } from './types'

interface GenUIToolCallRendererProps {
  toolCalls: GenUIToolCall[]
  isStreaming: boolean
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

export const GenUIToolCallRenderer = memo(function GenUIToolCallRenderer({
  toolCalls,
  isStreaming,
}: GenUIToolCallRendererProps) {
  return (
    <>
      {toolCalls.map((tc) => {
        const input = resolveInput(tc)

        if (input) {
          const rendered = renderGenUIToolCall(tc.name, input)
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

        logError(
          'GenUI arguments never parsed',
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
      })}
    </>
  )
})
