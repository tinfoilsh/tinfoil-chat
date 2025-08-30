'use client'

import { memo } from 'react'
import { MessageContent } from './MessageContent'

interface StreamingTextProps {
  content: string
  isDarkMode: boolean
  isUser?: boolean
}

export const StreamingText = memo(function StreamingText({
  content,
  isDarkMode,
  isUser = false,
}: StreamingTextProps) {
  // Since we're not using cursor anymore, just render the content directly
  return (
    <MessageContent content={content} isDarkMode={isDarkMode} isUser={isUser} />
  )
})
