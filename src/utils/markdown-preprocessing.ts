/**
 * Wraps code in backticks using a delimiter longer than any backtick run in the content.
 * Per CommonMark, if using multiple backticks, spaces separate content from delimiters.
 */
function wrapInlineCode(code: string): string {
  const backtickRuns = code.match(/`+/g) || []
  const maxRun = backtickRuns.reduce((max, run) => Math.max(max, run.length), 0)
  const delimiter = '`'.repeat(maxRun + 1)

  if (maxRun === 0) {
    return `\`${code}\``
  }
  return `${delimiter} ${code} ${delimiter}`
}

/**
 * Preprocesses markdown content to fix common formatting issues
 * and convert HTML tags to markdown equivalents.
 * Preserves code blocks and inline code to avoid breaking examples.
 */
export function preprocessMarkdown(content: string): string {
  // First, fix inline fenced code blocks inside table rows.
  // These look like ```lang\ncode``` on a single line (with literal \n, not newlines)
  // and break table parsing. Convert them to inline code.
  let processed = content.replace(
    /^(\|.*?)```[^\s`]*\\n(.+?)```(.*\|)$/gm,
    (_, before, code, after) => {
      const cleanedCode = code.replace(/\\n/g, ' ').trim()
      return `${before}${wrapInlineCode(cleanedCode)}${after}`
    },
  )

  // Also handle cases where the code block spans multiple cells or has no \n
  processed = processed.replace(
    /^(\|.*?)```[^\s`]*\s*([^`\n]+?)```(.*\|)$/gm,
    (_, before, code, after) => {
      const cleanedCode = code.trim()
      return `${before}${wrapInlineCode(cleanedCode)}${after}`
    },
  )

  // Extract code blocks and inline code to protect them
  const codeBlocks: string[] = []
  const inlineCode: string[] = []

  // Protect fenced code blocks (```...```)
  processed = processed.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match)
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`
  })

  // Protect inline code - handles both single and multi-backtick delimiters
  // Multi-backtick format from wrapInlineCode: `` content `` (with spaces)
  // Single-backtick format: `content`
  processed = processed.replace(/(`+) .+? \1|`[^`]+`/g, (match) => {
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

  // Convert <br>, <br/>, and </br> to markdown line breaks
  processed = processed.replace(/<br\s*\/?>/gi, '  \n')
  processed = processed.replace(/<\/br>/gi, '  \n')

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
