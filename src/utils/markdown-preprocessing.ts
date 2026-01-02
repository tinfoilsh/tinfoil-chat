/**
 * Preprocesses markdown content to fix common formatting issues
 * and convert HTML tags to markdown equivalents.
 * Preserves code blocks and inline code to avoid breaking examples.
 */
export function preprocessMarkdown(content: string): string {
  // Extract code blocks and inline code to protect them
  const codeBlocks: string[] = []
  const inlineCode: string[] = []

  // Protect fenced code blocks (```...```)
  let processed = content.replace(/```[\s\S]*?```/g, (match) => {
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
