import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { GeneratingTable } from './GeneratingTable'
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

// Check if a line looks like a markdown table separator (|---|---|)
function isTableSeparator(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return false
  // Should contain only |, -, :, and spaces
  return /^\|[\s\-:|]+\|$/.test(trimmed) && trimmed.includes('-')
}

// Extract table boundaries from content
// Returns { tableStart, tableEnd, isComplete } where isComplete means we've seen content after the table
// A valid table needs: header row, separator row, and at least one data row
function findTableBoundaries(
  content: string,
  startFrom: number = 0,
): { tableStart: number; tableEnd: number; isComplete: boolean } | null {
  const lines = content.substring(startFrom).split('\n')
  let tableStart = -1
  let tableEnd = -1
  let charIndex = startFrom
  let inTable = false
  let tableRowCount = 0
  let hasSeparator = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmedLine = line.trim()
    const startsWithPipe = trimmedLine.startsWith('|')

    if (!inTable && startsWithPipe) {
      // Starting a potential table
      inTable = true
      tableStart = charIndex
      tableRowCount = 1
      hasSeparator = isTableSeparator(line)
    } else if (inTable && startsWithPipe) {
      // Continuing table
      tableRowCount++
      if (isTableSeparator(line)) {
        hasSeparator = true
      }
    } else if (inTable && !startsWithPipe && trimmedLine !== '') {
      // Found a non-empty line that doesn't start with | - table ends here
      // Only consider it a valid table if it has separator and at least 3 rows
      if (hasSeparator && tableRowCount >= 3) {
        tableEnd = charIndex
        return { tableStart, tableEnd, isComplete: true }
      } else {
        // Not a valid table, reset
        inTable = false
        tableStart = -1
        tableRowCount = 0
        hasSeparator = false
      }
    }

    charIndex += line.length + 1 // +1 for newline
  }

  // If we're still in a table at the end
  if (inTable && hasSeparator && tableRowCount >= 3) {
    tableEnd = content.length
    return { tableStart, tableEnd, isComplete: false }
  }

  // If we have a potential table starting with at least header + separator,
  // show the placeholder during streaming
  if (inTable && hasSeparator && tableRowCount >= 2) {
    tableEnd = content.length
    return { tableStart, tableEnd, isComplete: false }
  }

  return null
}

function splitIntoChunks(
  content: string,
  isStreaming: boolean,
): ContentChunk[] {
  if (!content) return []

  // Find all complete code blocks (opening and closing ```)
  const codeBlockRegex = /```[\s\S]*?```/g
  const codeMatches = Array.from(content.matchAll(codeBlockRegex))

  const chunks: ContentChunk[] = []

  // First, process code blocks as they take precedence
  const codeBlocks = codeMatches.map((m) => ({
    type: 'code' as const,
    start: m.index!,
    end: m.index! + m[0].length,
    content: m[0],
  }))

  // Now process content, looking for tables between/after code blocks
  let currentPos = 0

  for (const codeBlock of codeBlocks) {
    // Process content before this code block
    if (codeBlock.start > currentPos) {
      const beforeCode = content.substring(currentPos, codeBlock.start)
      processContentForTables(
        beforeCode,
        currentPos,
        chunks,
        false, // Content before a code block is complete
      )
    }

    // Add the code block
    chunks.push({
      id: `code-${codeBlock.start}`,
      content: codeBlock.content,
      isComplete: true,
    })

    currentPos = codeBlock.end
  }

  // Process remaining content after all code blocks
  if (currentPos < content.length) {
    const remaining = content.substring(currentPos)

    // Check for incomplete code block in remaining
    const hasIncompleteCodeBlock =
      remaining.includes('```') &&
      (remaining.match(/```/g) || []).length % 2 !== 0

    if (hasIncompleteCodeBlock) {
      const lastTripleBacktick = remaining.lastIndexOf('```')
      if (lastTripleBacktick > 0) {
        const beforeCode = remaining.substring(0, lastTripleBacktick)
        // Content before the incomplete code block is complete
        processContentForTables(beforeCode, currentPos, chunks, false)
      }
      chunks.push({
        id: `code-incomplete-${currentPos + (lastTripleBacktick > 0 ? lastTripleBacktick : 0)}`,
        content: remaining.substring(
          lastTripleBacktick > 0 ? lastTripleBacktick : 0,
        ),
        isComplete: false,
      })
    } else {
      processContentForTables(remaining, currentPos, chunks, isStreaming)
    }
  }

  // If no chunks were created, return the whole content as one chunk
  if (chunks.length === 0) {
    return [
      {
        id: 'text-0',
        content,
        isComplete: !isStreaming,
      },
    ]
  }

  return chunks
}

function processContentForTables(
  content: string,
  baseOffset: number,
  chunks: ContentChunk[],
  isStreaming: boolean,
): void {
  if (!content.trim()) return

  const tableBoundaries = findTableBoundaries(content, 0)

  if (!tableBoundaries) {
    // No table found, add as text
    chunks.push({
      id: `text-${baseOffset}`,
      content,
      isComplete: !isStreaming,
    })
    return
  }

  const { tableStart, tableEnd, isComplete: tableIsComplete } = tableBoundaries

  // Add text before table
  if (tableStart > 0) {
    const beforeTable = content.substring(0, tableStart)
    if (beforeTable.trim()) {
      chunks.push({
        id: `text-${baseOffset}`,
        content: beforeTable,
        isComplete: true,
      })
    }
  }

  // Add the table
  const tableContent = content.substring(tableStart, tableEnd)
  // Table is complete if:
  // 1. We're not streaming at all, OR
  // 2. We found content after the table (tableIsComplete), OR
  // 3. The table content ends with a non-pipe line
  const isTableComplete = !isStreaming || tableIsComplete

  chunks.push({
    id: `table-${baseOffset}`,
    content: tableContent,
    isComplete: isTableComplete,
  })

  // Add content after table
  if (tableEnd < content.length) {
    const afterTable = content.substring(tableEnd)
    if (afterTable.trim()) {
      // Recursively process in case there are more tables
      processContentForTables(
        afterTable,
        baseOffset + tableEnd,
        chunks,
        isStreaming,
      )
    }
  }
}

// Check if a chunk contains table content
function isTableChunk(chunk: ContentChunk): boolean {
  const trimmed = chunk.content.trimStart()
  // Tables start with | character
  return trimmed.startsWith('|') || trimmed.startsWith('\n|')
}

// Individual chunk component with proper memoization
const ChunkRenderer = memo(
  function ChunkRenderer({
    chunk,
    isDarkMode,
    isUser,
    isStreaming,
  }: {
    chunk: ContentChunk
    isDarkMode: boolean
    isUser?: boolean
    isStreaming?: boolean
  }) {
    const wasIncompleteRef = useRef(!chunk.isComplete)
    const [shouldAnimate, setShouldAnimate] = useState(false)
    const isTable = isTableChunk(chunk)

    // Track when a table transitions from incomplete to complete
    useEffect(() => {
      if (isTable && wasIncompleteRef.current && chunk.isComplete) {
        setShouldAnimate(true)
      }
      wasIncompleteRef.current = !chunk.isComplete
    }, [chunk.isComplete, isTable])

    // If this is an incomplete table during streaming, show placeholder
    if (isTable && !chunk.isComplete && isStreaming) {
      return <GeneratingTable isDarkMode={isDarkMode} />
    }

    // Render content, with fade-in animation for tables that just completed
    return (
      <div className={shouldAnimate ? 'animate-fadeIn' : ''}>
        <MessageContent
          content={chunk.content}
          isDarkMode={isDarkMode}
          isUser={isUser}
          isStreaming={isStreaming}
        />
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Only re-render if content actually changed or completion status changed
    if (prevProps.chunk.isComplete && nextProps.chunk.isComplete) {
      // Both complete - only re-render if content is different
      return (
        prevProps.chunk.content === nextProps.chunk.content &&
        prevProps.isDarkMode === nextProps.isDarkMode &&
        prevProps.isStreaming === nextProps.isStreaming
      )
    }
    // One or both incomplete - check everything
    return (
      prevProps.chunk.content === nextProps.chunk.content &&
      prevProps.chunk.isComplete === nextProps.chunk.isComplete &&
      prevProps.isDarkMode === nextProps.isDarkMode &&
      prevProps.isStreaming === nextProps.isStreaming
    )
  },
)

export const StreamingChunkedText = memo(function StreamingChunkedText({
  content,
  isDarkMode,
  isUser = false,
  isStreaming = false,
}: StreamingChunkedTextProps) {
  const chunks = useMemo(
    () => splitIntoChunks(content, isStreaming),
    [content, isStreaming],
  )

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
        isStreaming={isStreaming}
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
          isStreaming={isStreaming}
        />
      ))}
    </>
  )
})
