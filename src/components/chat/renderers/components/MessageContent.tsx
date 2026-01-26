import { TooltipProvider } from '@/components/ui/tooltip'
import {
  processLatexTags,
  sanitizeUnsupportedMathBlocks,
} from '@/utils/latex-processing'
import { preprocessMarkdown } from '@/utils/markdown-preprocessing'
import { memo, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import { GeneratingTable } from './GeneratingTable'
import { createMarkdownComponents } from './markdown-components'
import { useMathPlugins } from './use-math-plugins'

interface MessageContentProps {
  content: string
  isDarkMode: boolean
  isUser?: boolean
  isStreaming?: boolean
}

function hasStreamingMarkdownTableCodeBlock(content: string): boolean {
  const markdownBlockMatch = content.match(/```(?:markdown|md)\n([\s\S]*)$/)
  if (!markdownBlockMatch) return false

  const blockContent = markdownBlockMatch[1]
  if (blockContent.includes('```')) return false

  const lines = blockContent.split('\n')
  let hasHeader = false
  let hasSeparator = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      hasHeader = true
    }
    if (/^\|[\s\-:|]+\|$/.test(trimmed) && trimmed.includes('-')) {
      hasSeparator = true
    }
  }
  return hasHeader && hasSeparator
}

export const MessageContent = memo(function MessageContent({
  content,
  isDarkMode,
  isUser = false,
  isStreaming = false,
}: MessageContentProps) {
  const { remarkPlugins, rehypePlugins } = useMathPlugins()
  const preprocessed = preprocessMarkdown(content)
  const processedContent = processLatexTags(preprocessed)
  const sanitizedContent = sanitizeUnsupportedMathBlocks(processedContent)

  const showMarkdownTablePlaceholder = useMemo(() => {
    if (!isStreaming) return false
    return hasStreamingMarkdownTableCodeBlock(content)
  }, [isStreaming, content])

  const components = useMemo(
    () =>
      createMarkdownComponents({
        isDarkMode,
        isStreaming,
        showMarkdownTablePlaceholder,
      }),
    [isDarkMode, isStreaming, showMarkdownTablePlaceholder],
  )

  if (isUser) {
    return <div className="whitespace-pre-wrap break-words">{content}</div>
  }

  return (
    <TooltipProvider>
      <div translate="no">
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          components={components}
        >
          {sanitizedContent}
        </ReactMarkdown>
        {showMarkdownTablePlaceholder && <GeneratingTable />}
      </div>
    </TooltipProvider>
  )
})
