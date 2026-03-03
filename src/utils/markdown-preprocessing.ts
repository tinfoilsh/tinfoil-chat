/**
 * LLMs often produce code fences at column 0 inside list items,
 * but CommonMark requires list continuation content to be indented
 * to the list item's content column. This function detects
 * under-indented code fences within list items and adds the
 * necessary indentation so remark parses them as part of the list.
 */
export function indentCodeBlocksInLists(content: string): string {
  const lines = content.split('\n')
  const result: string[] = []
  let listContentIndent = 0
  let inList = false
  let indentDelta = 0
  let inReindentedBlock = false
  let openingFenceChar = ''
  let openingFenceLength = 0

  for (const line of lines) {
    // Detect list item start (ordered: "1. ", "2.  ", unordered: "- ", "* ")
    if (!inReindentedBlock) {
      const listMatch = line.match(/^(\s*)(\d+[.)]\s+|[-*+]\s+)/)
      if (listMatch) {
        inList = true
        listContentIndent = listMatch[1].length + listMatch[2].length
        result.push(line)
        continue
      }
    }

    // Detect under-indented code fence in list context
    if (inList && !inReindentedBlock) {
      const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/)
      if (fenceMatch) {
        const fenceIndent = fenceMatch[1].length
        if (fenceIndent < listContentIndent) {
          indentDelta = listContentIndent - fenceIndent
          openingFenceChar = fenceMatch[2][0]
          openingFenceLength = fenceMatch[2].length
          result.push(' '.repeat(indentDelta) + line)
          inReindentedBlock = true
          continue
        }
      }
    }

    // Process lines inside a re-indented code block
    if (inReindentedBlock) {
      const trimmed = line.trim()
      const closingMatch = trimmed.match(/^(`{3,}|~{3,})\s*$/)
      const isClosingFence =
        closingMatch !== null &&
        closingMatch[1][0] === openingFenceChar &&
        closingMatch[1].length >= openingFenceLength
      if (isClosingFence) {
        result.push(' '.repeat(listContentIndent) + trimmed)
        inReindentedBlock = false
      } else {
        result.push(' '.repeat(indentDelta) + line)
      }
      continue
    }

    // Track when we leave the list context
    if (inList && line.trim() !== '') {
      const firstNonSpace = line.search(/\S/)
      const isNewListItem = /^\s*(\d+[.)]\s+|[-*+]\s+)/.test(line)
      if (
        firstNonSpace >= 0 &&
        firstNonSpace < listContentIndent &&
        !isNewListItem
      ) {
        inList = false
      }
    }

    result.push(line)
  }

  return result.join('\n')
}

/**
 * Preprocesses markdown content to fix common formatting issues
 * and convert HTML tags to markdown equivalents.
 * Preserves code blocks and inline code to avoid breaking examples.
 */
export function preprocessMarkdown(content: string): string {
  // Fix under-indented code blocks inside list items before any other processing
  const indented = indentCodeBlocksInLists(content)

  // Extract code blocks and inline code to protect them
  const codeBlocks: string[] = []
  const inlineCode: string[] = []

  // Protect fenced code blocks (``` and ~~~)
  let processed = indented.replace(/(`{3,}|~{3,})[\s\S]*?\1/g, (match) => {
    codeBlocks.push(match)
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`
  })

  // Protect inline code (`...`)
  processed = processed.replace(/`[^`]+`/g, (match) => {
    inlineCode.push(match)
    return `__INLINE_CODE_${inlineCode.length - 1}__`
  })

  // Convert <a href="url">text</a> to [text](url)
  processed = processed.replace(
    /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi,
    (_, url, text) => {
      const linkText = text.trim() || url
      return `[${linkText}](${url})`
    },
  )

  // Convert <b>text</b> and <strong>text</strong> to **text**
  processed = processed.replace(/<b>([^<]*)<\/b>/gi, '**$1**')
  processed = processed.replace(/<strong>([^<]*)<\/strong>/gi, '**$1**')

  // Restore inline code first (they might be inside code blocks)
  processed = processed.replace(
    /__INLINE_CODE_(\d+)__/g,
    (_, index) => inlineCode[parseInt(index)],
  )

  // Restore code blocks
  processed = processed.replace(
    /__CODE_BLOCK_(\d+)__/g,
    (_, index) => codeBlocks[parseInt(index)],
  )

  return processed
}
