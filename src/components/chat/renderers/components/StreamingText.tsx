'use client'

import { memo } from 'react'
import { MessageContent } from './MessageContent'

interface StreamingTextProps {
  content: string
  isDarkMode: boolean
  isUser?: boolean
  // When true, content is streaming and may update very frequently
  isStreaming?: boolean
}

export const StreamingText = memo(function StreamingText({
  content,
  isDarkMode,
  isUser = false,
}: StreamingTextProps) {
  // Since we're not buffering content anymore, just render it directly
  // The scrolling issues in code blocks should be handled at the code block level
  return (
    <MessageContent content={content} isDarkMode={isDarkMode} isUser={isUser} />
  )
})
