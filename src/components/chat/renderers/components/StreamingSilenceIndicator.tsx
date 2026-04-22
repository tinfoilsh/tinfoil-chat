import { LoadingDots } from '@/components/loading-dots'
import { memo } from 'react'

interface StreamingSilenceIndicatorProps {
  /** True while the model is actively reasoning (thoughts are streaming). */
  isThinking: boolean
  /** True while web search is in progress. */
  hasActiveWebSearch: boolean
  /** True when the message already has tool-call placeholders showing their own loader. */
  hasActiveToolCalls: boolean
}

/**
 * Shown below a streaming assistant message when nothing else is animating.
 *
 * Bridges the gap between the last visible stream event (typically a text
 * delta like "Let me make some components…") and the first finalized tool
 * call arriving from the model, which can take many seconds when the model
 * is producing many GenUI elements.
 */
export const StreamingSilenceIndicator = memo(
  function StreamingSilenceIndicator({
    isThinking,
    hasActiveWebSearch,
    hasActiveToolCalls,
  }: StreamingSilenceIndicatorProps) {
    if (isThinking || hasActiveWebSearch || hasActiveToolCalls) return null

    return (
      <div className="mx-4 my-4 rounded-lg border border-border-subtle bg-surface-chat-background/40 px-4 py-4">
        <div className="flex items-center gap-2 text-xs font-medium text-content-muted">
          <LoadingDots />
          <span>Preparing response</span>
        </div>
        <div aria-hidden="true" className="mt-3 space-y-2">
          <div className="h-3 w-2/3 animate-pulse rounded bg-surface-chat-background" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-surface-chat-background" />
          <div className="h-20 w-full animate-pulse rounded bg-surface-chat-background" />
        </div>
      </div>
    )
  },
)
