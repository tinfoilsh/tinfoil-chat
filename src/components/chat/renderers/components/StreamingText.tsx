import { memo } from 'react'
import { MessageContent } from './MessageContent'

interface StreamingTextProps {
  content: string
  isDarkMode: boolean
  isUser?: boolean
  citationUrlTitles?: Map<string, string>
}

export const StreamingText = memo(function StreamingText({
  content,
  isDarkMode,
  isUser = false,
  citationUrlTitles,
}: StreamingTextProps) {
  // Since we're not buffering content anymore, just render it directly
  // The scrolling issues in code blocks should be handled at the code block level
  return (
    <MessageContent
      content={content}
      isDarkMode={isDarkMode}
      isUser={isUser}
      citationUrlTitles={citationUrlTitles}
    />
  )
})
