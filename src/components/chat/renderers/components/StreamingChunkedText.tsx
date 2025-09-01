'use client'

import { memo, useMemo } from 'react'
import { MessageContent } from './MessageContent'

interface StreamingChunkedTextProps {
  content: string
  isDarkMode: boolean
  isUser?: boolean
  isStreaming?: boolean
}

interface ContentChunk {
  id: string
  content: string
  isComplete: boolean
}

function splitIntoChunks(
  content: string,
  isStreaming: boolean,
): ContentChunk[] {
  if (!content) return []

  // Find all complete code blocks (opening and closing ```)
  const codeBlockRegex = /```[\s\S]*?```/g
  const matches = Array.from(content.matchAll(codeBlockRegex))

  if (matches.length === 0) {
    // No code blocks, return single chunk
    return [
      {
        id: 'single-chunk',
        content,
        isComplete: !isStreaming,
      },
    ]
  }

  const chunks: ContentChunk[] = []
  let lastIndex = 0

  // Process each complete code block
  matches.forEach((match, index) => {
    const blockStart = match.index!
    const blockEnd = blockStart + match[0].length

    // Add text before code block if any
    if (blockStart > lastIndex) {
      const beforeText = content.substring(lastIndex, blockStart)
      if (beforeText.trim()) {
        chunks.push({
          id: `text-${lastIndex}`,
          content: beforeText,
          isComplete: true,
        })
      }
    }

    // Add the complete code block
    chunks.push({
      id: `code-${blockStart}`,
      content: match[0],
      isComplete: true,
    })

    lastIndex = blockEnd
  })

  // Add remaining content after last code block
  if (lastIndex < content.length) {
    const remaining = content.substring(lastIndex)

    if (isStreaming) {
      // Check if we're potentially starting a new code block
      const hasIncompleteCodeBlock =
        remaining.includes('```') &&
        (remaining.match(/```/g) || []).length % 2 !== 0

      if (hasIncompleteCodeBlock) {
        // Split at the last ``` to keep complete content separate
        const lastTripleBacktick = remaining.lastIndexOf('```')

        if (lastTripleBacktick > 0) {
          const beforeIncomplete = remaining.substring(0, lastTripleBacktick)
          if (beforeIncomplete.trim()) {
            chunks.push({
              id: `text-${lastIndex}`,
              content: beforeIncomplete,
              isComplete: true,
            })
          }
        }

        // Add the incomplete part (this will keep updating during stream)
        chunks.push({
          id: `streaming-${lastIndex}`,
          content: remaining.substring(
            lastTripleBacktick > 0 ? lastTripleBacktick : 0,
          ),
          isComplete: false,
        })
      } else {
        // No incomplete code block, add as streaming text
        chunks.push({
          id: `streaming-${lastIndex}`,
          content: remaining,
          isComplete: false,
        })
      }
    } else {
      // Not streaming, all content is complete
      if (remaining.trim()) {
        chunks.push({
          id: `text-${lastIndex}`,
          content: remaining,
          isComplete: true,
        })
      }
    }
  }

  return chunks
}

// Individual chunk component with proper memoization
const ChunkRenderer = memo(
  function ChunkRenderer({
    chunk,
    isDarkMode,
    isUser,
  }: {
    chunk: ContentChunk
    isDarkMode: boolean
    isUser?: boolean
  }) {
    return (
      <MessageContent
        content={chunk.content}
        isDarkMode={isDarkMode}
        isUser={isUser}
      />
    )
  },
  (prevProps, nextProps) => {
    // Only re-render if content actually changed or completion status changed
    if (prevProps.chunk.isComplete && nextProps.chunk.isComplete) {
      // Both complete - only re-render if content is different
      return (
        prevProps.chunk.content === nextProps.chunk.content &&
        prevProps.isDarkMode === nextProps.isDarkMode
      )
    }
    // One or both incomplete - check everything
    return (
      prevProps.chunk.content === nextProps.chunk.content &&
      prevProps.chunk.isComplete === nextProps.chunk.isComplete &&
      prevProps.isDarkMode === nextProps.isDarkMode
    )
  },
)

export const StreamingChunkedText = memo(function StreamingChunkedText({
  content,
  isDarkMode,
  isUser = false,
  isStreaming = false,
}: StreamingChunkedTextProps) {
  // Split content into chunks
  const chunks = useMemo(
    () => splitIntoChunks(content, isStreaming),
    [content, isStreaming],
  )

  // If only one chunk and no code blocks, render directly for efficiency
  if (chunks.length === 1 && !content.includes('```')) {
    return (
      <MessageContent
        content={content}
        isDarkMode={isDarkMode}
        isUser={isUser}
      />
    )
  }

  // Render chunks separately for interactivity
  return (
    <>
      {chunks.map((chunk) => (
        <ChunkRenderer
          key={chunk.id}
          chunk={chunk}
          isDarkMode={isDarkMode}
          isUser={isUser}
        />
      ))}
    </>
  )
})
