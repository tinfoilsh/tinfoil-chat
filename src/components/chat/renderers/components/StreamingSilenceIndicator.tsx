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
      <div className="my-2 flex items-center gap-2 px-4 text-sm text-content-muted">
        <LoadingDots />
        <span>Preparing response</span>
      </div>
    )
  },
)
