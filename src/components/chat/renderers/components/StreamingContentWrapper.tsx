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
  const measurementFrameRef = useRef<number | null>(null)
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

    if (!isStreaming) {
      return
    }

    if (!contentRef.current) return

    // Function to measure and update minimum height
    const measureHeight = () => {
      if (contentRef.current && isStreaming) {
        const currentHeight = contentRef.current.scrollHeight

        // Only increase, never decrease during streaming
        if (currentHeight > maxHeightRef.current) {
          maxHeightRef.current = currentHeight
          setMinHeight(currentHeight)
        }

        // Continue measuring while streaming
        measurementFrameRef.current = requestAnimationFrame(measureHeight)
      }
    }

    // Start measuring
    measureHeight()

    // Cleanup
    return () => {
      if (measurementFrameRef.current) {
        cancelAnimationFrame(measurementFrameRef.current)
        measurementFrameRef.current = null
      }
      // Clear hold timeout on unmount or when effect re-runs
      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current)
        holdTimeoutRef.current = null
      }
    }
  }, [isStreaming, holdAfterStopMs])

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
