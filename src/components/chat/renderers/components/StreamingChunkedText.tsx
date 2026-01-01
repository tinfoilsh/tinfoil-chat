import { memo } from 'react'
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

// Hash function using cyrb53 algorithm for better distribution and fewer collisions
// Returns a 53-bit hash as a string, combined with length for additional uniqueness
function contentHash(str: string): string {
  // cyrb53 hash - fast and has good distribution
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0)
  return `${hash.toString(36)}-${str.length}`
}

function splitIntoChunks(
  content: string,
  isStreaming: boolean,
): ContentChunk[] {
  if (!content) return []

  // Find all complete code blocks (opening and closing ```)
  const codeBlockRegex = /```[\s\S]*?```/g
  const codeMatches = Array.from(content.matchAll(codeBlockRegex))

  // Find all complete tables
  // A complete table must have:
  // 1. Header row (|...|)
  // 2. Separator row (|---|---|) with proper column separators
  // 3. At least one data row (|...|)
  const tableRegex =
    /(?:^|\n)(\|[^\n]+\|\n\|(?:[-: ]+\|)+\n(?:\|[^\n]+\|\n?)+)/gm
  const tableMatches = Array.from(content.matchAll(tableRegex))

  // Combine and sort all matches by position
  const allMatches = [
    ...codeMatches.map((m) => ({ type: 'code', match: m, index: m.index! })),
    ...tableMatches.map((m) => ({ type: 'table', match: m, index: m.index! })),
  ].sort((a, b) => a.index - b.index)

  if (allMatches.length === 0) {
    // No code blocks or tables, return single chunk
    return [
      {
        id: 'main',
        content,
        isComplete: !isStreaming,
      },
    ]
  }

  const chunks: ContentChunk[] = []
  let lastIndex = 0

  // Process each complete block (code or table)
  allMatches.forEach((item, matchIndex) => {
    const blockStart = item.index
    const blockContent = item.match[0]
    const blockEnd = blockStart + blockContent.length

    // Skip if this block overlaps with previous content
    if (blockStart < lastIndex) {
      return
    }

    // Add text before block if any
    if (blockStart > lastIndex) {
      const beforeText = content.substring(lastIndex, blockStart)
      if (beforeText.trim()) {
        // Include chunk index to ensure uniqueness when identical text appears multiple times
        chunks.push({
          id: `text-${chunks.length}-${contentHash(beforeText)}`,
          content: beforeText,
          isComplete: true,
        })
      }
    }

    // Add the complete block (code or table)
    // Use match index + type for stable ID since complete blocks are immutable
    chunks.push({
      id: `${item.type}-${matchIndex}`,
      content: blockContent,
      isComplete: true,
    })

    lastIndex = blockEnd
  })

  // Add remaining content after last block
  if (lastIndex < content.length) {
    const remaining = content.substring(lastIndex)

    if (isStreaming) {
      // Check if we're potentially starting a new code block or table
      const hasIncompleteCodeBlock =
        remaining.includes('```') &&
        (remaining.match(/```/g) || []).length % 2 !== 0

      // Check for incomplete table (starts with | but might not be complete)
      const hasIncompleteTable =
        /\n\|[^\n]*$/.test(remaining) || /^\|[^\n]*$/.test(remaining)

      if (hasIncompleteCodeBlock) {
        // Split at the last ``` to keep complete content separate
        const lastTripleBacktick = remaining.lastIndexOf('```')

        if (lastTripleBacktick > 0) {
          const beforeIncomplete = remaining.substring(0, lastTripleBacktick)
          if (beforeIncomplete.trim()) {
            chunks.push({
              id: `text-${chunks.length}-${contentHash(beforeIncomplete)}`,
              content: beforeIncomplete,
              isComplete: true,
            })
          }
        }

        // Add the incomplete part with stable streaming ID
        chunks.push({
          id: 'streaming',
          content: remaining.substring(
            lastTripleBacktick > 0 ? lastTripleBacktick : 0,
          ),
          isComplete: false,
        })
      } else if (hasIncompleteTable) {
        // Find where the incomplete table starts
        const tableStartMatch =
          remaining.match(/\n(\|[^\n]*)$/) || remaining.match(/^(\|[^\n]*)$/)
        if (tableStartMatch) {
          const tableStart = tableStartMatch.index!

          // Add text before incomplete table
          if (tableStart > 0) {
            const beforeTable = remaining.substring(0, tableStart)
            if (beforeTable.trim()) {
              chunks.push({
                id: `text-${chunks.length}-${contentHash(beforeTable)}`,
                content: beforeTable,
                isComplete: true,
              })
            }
          }

          // Add the incomplete table part with stable streaming ID
          chunks.push({
            id: 'streaming',
            content: remaining.substring(tableStart),
            isComplete: false,
          })
        } else {
          // Fallback to streaming text
          chunks.push({
            id: 'streaming',
            content: remaining,
            isComplete: false,
          })
        }
      } else {
        // No incomplete blocks, add as streaming text
        chunks.push({
          id: 'streaming',
          content: remaining,
          isComplete: false,
        })
      }
    } else {
      // Not streaming, all content is complete
      if (remaining.trim()) {
        chunks.push({
          id: `text-${chunks.length}-${contentHash(remaining)}`,
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
  // Split content into chunks for interactivity
  const chunks = splitIntoChunks(content, isStreaming)

  // If only one chunk and no code blocks or tables, render directly for efficiency
  if (
    chunks.length === 1 &&
    !content.includes('```') &&
    !content.includes('|')
  ) {
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
