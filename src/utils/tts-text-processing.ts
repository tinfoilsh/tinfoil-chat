/**
 * Preprocesses markdown content for text-to-speech by stripping
 * elements that don't make sense when read aloud.
 */
export function sanitizeTextForTTS(content: string): string {
  let text = content

  // Remove code blocks (``` ... ```)
  text = text.replace(/```[\s\S]*?```/g, '')

  // Remove inline code (` ... `)
  text = text.replace(/`[^`\n]*`/g, '')

  // Remove images ![alt](url)
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')

  // Convert links [text](url) to just the text
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')

  // Remove bare URLs
  text = text.replace(/https?:\/\/[^\s)>\]]+/g, '')

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, '')

  // Remove LaTeX block equations ($$...$$)
  text = text.replace(/\$\$[\s\S]*?\$\$/g, '')

  // Remove inline LaTeX ($...$)
  text = text.replace(/\$[^$\n]+\$/g, '')

  // Remove markdown headings markers (keep the text)
  text = text.replace(/^#{1,6}\s+/gm, '')

  // Remove bold/italic markers (keep the text)
  text = text.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
  text = text.replace(/_{1,3}([^_]+)_{1,3}/g, '$1')

  // Remove strikethrough markers (keep the text)
  text = text.replace(/~~([^~]+)~~/g, '$1')

  // Remove horizontal rules
  text = text.replace(/^[-*_]{3,}\s*$/gm, '')

  // Remove blockquote markers (keep the text)
  text = text.replace(/^>\s?/gm, '')

  // Remove list markers (keep the text)
  text = text.replace(/^[\s]*[-*+]\s+/gm, '')
  text = text.replace(/^[\s]*\d+\.\s+/gm, '')

  // Remove table formatting
  text = text.replace(/\|/g, ' ')
  text = text.replace(/^[-:|\s]+$/gm, '')

  // Remove footnote references [^1]
  text = text.replace(/\[\^[^\]]*\]/g, '')

  // Collapse multiple newlines into a single pause
  text = text.replace(/\n{2,}/g, '\n')

  // Collapse multiple spaces
  text = text.replace(/ {2,}/g, ' ')

  // Trim
  text = text.trim()

  return text
}
