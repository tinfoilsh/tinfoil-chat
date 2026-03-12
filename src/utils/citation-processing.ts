import type { WebSearchSource } from '@/components/chat/types'

/**
 * Replace Chinese bracket citation markers like 【1】 with markdown links
 * that encode the source URL and title for rendering.
 * Called once at stream end to store processed content.
 */
export function processCitationMarkers(
  content: string,
  sources: WebSearchSource[],
): string {
  if (sources.length === 0) return content

  return content.replace(/【(\d+)[^】]*】/g, (match, num) => {
    const index = parseInt(num, 10) - 1
    const source = sources[index]
    if (!source) return match
    const encodedUrl = source.url
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\|/g, '%7C')
      .replace(/~/g, '%7E')
    const encodedTitle = encodeURIComponent(source.title || '')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/~/g, '%7E')
    return `[${num}](#cite-${num}~${encodedUrl}~${encodedTitle})`
  })
}
