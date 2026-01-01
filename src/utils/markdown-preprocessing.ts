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
    (match, url, text) => {
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

  // Fix malformed bold/italic markers by moving internal whitespace outside
  // Markdown requires no space immediately after opening ** or before closing **
  // e.g., "**text **" -> "**text** " and "** text**" -> " **text**"
  // This preserves spacing while making the markers valid
  // Process leading space first, then trailing, to handle "** text **" case
  // Uses negative lookahead/lookbehind to handle nested formatting correctly
  // Note: These fixes are primarily needed for Kimi K2 thinking model which outputs malformed markdown

  // Bold with asterisks - match ** then content (may include single * but not **) then spaces then **
  // Leading: ** spaces content ** -> spaces **content**
  processed = processed.replace(/\*\*( +)((?:(?!\*\*).)+)\*\*/g, '$1**$2**')
  // Trailing: ** content spaces ** -> **content** spaces
  processed = processed.replace(/\*\*((?:(?!\*\*).)+?)( +)\*\*/g, '**$1**$2')

  // Bold with underscores - match __ then content (may include single _ but not __) then spaces then __
  processed = processed.replace(/__( +)((?:(?!__).)+)__/g, '$1__$2__') // leading
  processed = processed.replace(/__((?:(?!__).)+?)( +)__/g, '__$1__$2') // trailing

  // Italic with asterisk (avoid matching **) - content may include _ but not *
  processed = processed.replace(/(?<!\*)\*( +)([^*]+)\*(?!\*)/g, '$1*$2*') // leading
  processed = processed.replace(/(?<!\*)\*([^*]+?)( +)\*(?!\*)/g, '*$1*$2') // trailing

  // Italic with underscore (avoid matching __) - content may include * but not _
  processed = processed.replace(/(?<!_)_( +)([^_]+)_(?!_)/g, '$1_$2_') // leading
  processed = processed.replace(/(?<!_)_([^_]+?)( +)_(?!_)/g, '_$1_$2') // trailing

  // Strikethrough - content may include single ~ but not ~~
  processed = processed.replace(/~~( +)((?:(?!~~).)+)~~/g, '$1~~$2~~') // leading
  processed = processed.replace(/~~((?:(?!~~).)+?)( +)~~/g, '~~$1~~$2') // trailing

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
