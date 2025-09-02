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
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  useEffect(() => {
    if (!isStreaming) {
      // When streaming ends, transition to 0 first, then remove after transition completes
      if (minHeight !== undefined) {
        setMinHeight(0)

        // Clear any existing timeout
        if (transitionTimeoutRef.current) {
          clearTimeout(transitionTimeoutRef.current)
        }

        // Remove minHeight after transition completes
        transitionTimeoutRef.current = setTimeout(() => {
          setMinHeight(undefined)
          maxHeightRef.current = 0
        }, 300) // Match transition duration
      }
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
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current)
        transitionTimeoutRef.current = null
      }
    }
  }, [isStreaming, minHeight])

  return (
    <div
      ref={contentRef}
      style={{
        minHeight: minHeight !== undefined ? `${minHeight}px` : undefined,
        // Smooth transition both when streaming and when ending
        transition: 'min-height 0.3s ease-out',
      }}
    >
      {children}
    </div>
  )
})
