import { memo, useEffect, useRef, useState } from 'react'

interface StreamingContentWrapperProps {
  children: React.ReactNode
  isStreaming: boolean
  // Keep minHeight for a short period after streaming stops to avoid scroll bounce
  holdAfterStopMs?: number
}

/**
 * Wrapper component that prevents content from shrinking during streaming.
 * It maintains the maximum height reached to prevent jarring scroll jumps
 * when content temporarily expands (e.g., raw LaTeX) then contracts when rendered.
 */
export const StreamingContentWrapper = memo(function StreamingContentWrapper({
  children,
  isStreaming,
  holdAfterStopMs = 250,
}: StreamingContentWrapperProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [minHeight, setMinHeight] = useState<number | undefined>(undefined)
  const maxHeightRef = useRef<number>(0)
  const hasEverStreamedRef = useRef<boolean>(false)
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isHolding, setIsHolding] = useState<boolean>(false)

  useEffect(() => {
    // Track if we've streamed at least once to keep the wrapper stable during toggles
    if (isStreaming) {
      hasEverStreamedRef.current = true
      // Cancel any pending hold
      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current)
        holdTimeoutRef.current = null
      }
      setIsHolding(false)
    } else {
      // When streaming stops, briefly hold the minHeight to avoid a bounce
      if (hasEverStreamedRef.current) {
        setIsHolding(true)
        if (holdTimeoutRef.current) {
          clearTimeout(holdTimeoutRef.current)
        }
        holdTimeoutRef.current = setTimeout(
          () => {
            setIsHolding(false)
            holdTimeoutRef.current = null
            // Reset heights after hold to start fresh for next session
            setMinHeight(undefined)
            maxHeightRef.current = 0
            hasEverStreamedRef.current = false
          },
          Math.max(0, holdAfterStopMs),
        )
      } else {
        // If we never streamed, clear values
        setMinHeight(undefined)
        maxHeightRef.current = 0
        setIsHolding(false)
      }
    }

    return () => {
      // Clear hold timeout on unmount or when effect re-runs
      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current)
        holdTimeoutRef.current = null
      }
    }
  }, [isStreaming, holdAfterStopMs])

  useEffect(() => {
    if (
      !contentRef.current ||
      typeof ResizeObserver === 'undefined' ||
      (!isStreaming && !isHolding)
    ) {
      return
    }

    const node = contentRef.current
    const measureHeight = () => {
      const currentHeight = node.scrollHeight
      if (currentHeight > maxHeightRef.current) {
        maxHeightRef.current = currentHeight
        setMinHeight(currentHeight)
      }
    }

    measureHeight()

    const resizeObserver = new ResizeObserver(() => {
      measureHeight()
    })
    resizeObserver.observe(node)

    return () => {
      resizeObserver.disconnect()
    }
  }, [isStreaming, isHolding])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current)
        holdTimeoutRef.current = null
      }
    }
  }, [])

  return (
    <div
      ref={contentRef}
      style={{
        overflowAnchor: 'none',
        minHeight:
          (isStreaming || isHolding) && minHeight
            ? `${minHeight}px`
            : undefined,
      }}
    >
      {children}
    </div>
  )
})
