import { LoadingDots } from '@/components/loading-dots'
import { memo } from 'react'
import { renderGenUIToolCall } from './registry'
import type { GenUIToolCall } from './types'

interface GenUIToolCallRendererProps {
  toolCalls: GenUIToolCall[]
  isStreaming: boolean
}

export const GenUIToolCallRenderer = memo(function GenUIToolCallRenderer({
  toolCalls,
  isStreaming,
}: GenUIToolCallRendererProps) {
  return (
    <>
      {toolCalls.map((tc) => {
        let parsed: Record<string, unknown> | null = null
        try {
          parsed = JSON.parse(tc.arguments)
        } catch {
          // Arguments still streaming, JSON incomplete
        }

        if (parsed) {
          const rendered = renderGenUIToolCall(tc.name, parsed)
          if (rendered) {
            return (
              <div key={tc.id} className="my-4">
                {rendered}
              </div>
            )
          }
          // Parsed but unrecognized tool or failed validation — show fallback
          if (!isStreaming) {
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

        // Finished streaming but JSON never parsed — show fallback
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
