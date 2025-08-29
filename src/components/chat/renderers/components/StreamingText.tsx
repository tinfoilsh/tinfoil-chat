'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { MessageContent } from './MessageContent'

interface StreamingTextProps {
  content: string
  isDarkMode: boolean
  isUser?: boolean
  isStreaming?: boolean
}

export const StreamingText = memo(function StreamingText({
  content,
  isDarkMode,
  isUser = false,
  isStreaming = false,
}: StreamingTextProps) {
  const [showCursor, setShowCursor] = useState(false)
  const lastContentRef = useRef(content)
  const cursorTimeoutRef = useRef<NodeJS.Timeout>()
  const hasInitializedRef = useRef(false)

  useEffect(() => {
    // For user messages, never show cursor
    if (isUser) {
      setShowCursor(false)
      return
    }

    // Skip initial render
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true
      lastContentRef.current = content
      // Only show cursor on initial render if isStreaming is true
      if (isStreaming) {
        setShowCursor(true)
        cursorTimeoutRef.current = setTimeout(() => {
          setShowCursor(false)
        }, 500) // Hide after 500ms
      }
      return
    }

    // Detect if content is changing (streaming)
    if (
      content !== lastContentRef.current &&
      content.length > lastContentRef.current.length
    ) {
      lastContentRef.current = content

      // Content is growing, show cursor
      setShowCursor(true)

      // Clear any existing timeout
      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current)
      }

      // Hide cursor after 500ms of no changes
      cursorTimeoutRef.current = setTimeout(() => {
        setShowCursor(false)
      }, 500)
    }

    return () => {
      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current)
      }
    }
  }, [content, isUser, isStreaming])

  // Add cursor to content if streaming
  const displayContent = showCursor && !isUser ? content + ' ●' : content

  return (
    <MessageContent
      content={displayContent}
      isDarkMode={isDarkMode}
      isUser={isUser}
    />
  )
})
