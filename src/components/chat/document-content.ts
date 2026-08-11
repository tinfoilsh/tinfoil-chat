import type { DocumentPage } from './types'

export function getDocumentTextContent(
  content: string,
  pages?: DocumentPage[],
): string | null {
  if (content.trim()) return content

  const pageContent = pages
    ?.map((page) => page.text)
    .filter((text) => text.trim())
    .join('\n\n---\n\n')

  return pageContent?.trim() ? pageContent : null
}
