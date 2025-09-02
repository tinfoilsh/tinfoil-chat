'use client'

import { memo, useEffect, useRef, useState } from 'react'

interface StreamingContentWrapperProps {
  children: React.ReactNode
  isStreaming: boolean
}

/**
 * Wrapper component that prevents content from shrinking during streaming.
 * It maintains the maximum height reached to prevent jarring scroll jumps
 * when content temporarily expands (e.g., raw LaTeX) then contracts when rendered.
 */
export const StreamingContentWrapper = memo(function StreamingContentWrapper({
  children,
  isStreaming,
}: StreamingContentWrapperProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [minHeight, setMinHeight] = useState<number | undefined>(undefined)
  const maxHeightRef = useRef<number>(0)
  const measurementFrameRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isStreaming) {
      // Reset when streaming ends
      setMinHeight(undefined)
      maxHeightRef.current = 0
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
    }
  }, [isStreaming])

  return (
    <div
      ref={contentRef}
      style={{
        minHeight: isStreaming && minHeight ? `${minHeight}px` : undefined,
        // Smooth transition when streaming ends
        transition: !isStreaming ? 'min-height 0.3s ease-out' : undefined,
      }}
    >
      {children}
    </div>
  )
})
