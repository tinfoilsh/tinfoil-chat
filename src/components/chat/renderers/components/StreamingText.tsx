'use client'

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { MessageContent } from './MessageContent'

interface StreamingTextProps {
  content: string
  isDarkMode: boolean
  isUser?: boolean
  // When true, content is streaming and may update very frequently
  isStreaming?: boolean
}

// requestIdleCallback polyfill with a reasonable fallback
const requestIdle: (cb: () => void) => number =
  typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? (cb: () => void) =>
        (window as any).requestIdleCallback(cb, { timeout: 300 })
    : (cb: () => void) => window.setTimeout(cb, 120)

const clearIdle: (id: number) => void =
  typeof window !== 'undefined' && 'cancelIdleCallback' in window
    ? (id: number) => (window as any).cancelIdleCallback(id)
    : (id: number) => window.clearTimeout(id)

export const StreamingText = memo(function StreamingText({
  content,
  isDarkMode,
  isUser = false,
  isStreaming = false,
}: StreamingTextProps) {
  // We intentionally decouple rendered content from prop during streaming to avoid DOM resets
  const [displayedContent, setDisplayedContent] = useState<string>(content)

  // Track whether the user is interacting (mouse down/scrolling/touch)
  const isInteractingRef = useRef<boolean>(false)
  const pendingContentRef = useRef<string | null>(null)
  const idleFlushIdRef = useRef<number | null>(null)
  const scrollEndTimeoutRef = useRef<number | null>(null)

  // Keep displayed content in sync immediately when not streaming
  useEffect(() => {
    if (!isStreaming) {
      setDisplayedContent(content)
      pendingContentRef.current = null
    }
  }, [content, isStreaming])

  // When streaming, buffer updates while interacting; otherwise update immediately
  useEffect(() => {
    if (!isStreaming) return

    // If not interacting, apply immediately
    if (!isInteractingRef.current) {
      setDisplayedContent(content)
      pendingContentRef.current = null
      return
    }

    // If interacting, store as pending and schedule an idle flush
    pendingContentRef.current = content
    if (idleFlushIdRef.current != null) return
    idleFlushIdRef.current = requestIdle(() => {
      idleFlushIdRef.current = null
      if (!isInteractingRef.current && pendingContentRef.current != null) {
        setDisplayedContent(pendingContentRef.current)
        pendingContentRef.current = null
      }
    })
  }, [content, isStreaming])

  // When streaming stops, flush any pending content
  useEffect(() => {
    if (!isStreaming && pendingContentRef.current != null) {
      setDisplayedContent(pendingContentRef.current)
      pendingContentRef.current = null
      if (idleFlushIdRef.current != null) {
        clearIdle(idleFlushIdRef.current)
        idleFlushIdRef.current = null
      }
    }
  }, [isStreaming])

  // Manage interaction detection globally to avoid affecting layout structure
  useEffect(() => {
    const startInteract = () => {
      isInteractingRef.current = true
      if (idleFlushIdRef.current != null) {
        clearIdle(idleFlushIdRef.current)
        idleFlushIdRef.current = null
      }
    }
    const endInteract = () => {
      isInteractingRef.current = false
      if (pendingContentRef.current != null) {
        setDisplayedContent(pendingContentRef.current)
        pendingContentRef.current = null
      }
    }
    const handleWheel = () => {
      startInteract()
      if (scrollEndTimeoutRef.current != null) {
        window.clearTimeout(scrollEndTimeoutRef.current)
      }
      scrollEndTimeoutRef.current = window.setTimeout(endInteract, 150)
    }
    const handleScroll = handleWheel

    window.addEventListener('pointerdown', startInteract)
    window.addEventListener('pointerup', endInteract)
    window.addEventListener('wheel', handleWheel, { passive: true })
    // Capture scrolls from any element
    document.addEventListener('scroll', handleScroll, {
      passive: true,
      capture: true,
    })
    window.addEventListener('touchstart', startInteract, { passive: true })
    window.addEventListener('touchend', endInteract, { passive: true })

    return () => {
      window.removeEventListener('pointerdown', startInteract)
      window.removeEventListener('pointerup', endInteract)
      window.removeEventListener('wheel', handleWheel as EventListener)
      document.removeEventListener(
        'scroll',
        handleScroll as EventListener,
        {
          capture: true as unknown as boolean,
        } as unknown as EventListenerOptions,
      )
      window.removeEventListener('touchstart', startInteract as EventListener)
      window.removeEventListener('touchend', endInteract as EventListener)
      if (idleFlushIdRef.current != null) {
        clearIdle(idleFlushIdRef.current)
        idleFlushIdRef.current = null
      }
      if (scrollEndTimeoutRef.current != null) {
        window.clearTimeout(scrollEndTimeoutRef.current)
        scrollEndTimeoutRef.current = null
      }
    }
  }, [])

  // For SSR safety, memoize props to child
  const renderedContent = useMemo(() => displayedContent, [displayedContent])

  return (
    <MessageContent
      content={renderedContent}
      isDarkMode={isDarkMode}
      isUser={isUser}
    />
  )
})
