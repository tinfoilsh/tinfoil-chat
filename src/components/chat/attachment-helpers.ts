import type { Attachment, Message } from './types'

/**
 * Extract image attachments from a message, handling both new and legacy formats.
 */
export function getMessageImages(msg: Message): Attachment[] {
  if (msg.attachments && msg.attachments.length > 0) {
    return msg.attachments.filter((a) => a.type === 'image')
  }

  // Legacy format: reconstruct from documents + imageData
  if (msg.documents && msg.imageData) {
    return msg.imageData.map((img, i) => ({
      id: `legacy-img-${i}`,
      type: 'image' as const,
      fileName: msg.documents?.[i]?.name ?? 'Image',
      mimeType: img.mimeType,
      base64: img.base64,
    }))
  }

  return []
}

/**
 * Extract document attachments from a message, handling both new and legacy formats.
 */
export function getMessageDocuments(msg: Message): Attachment[] {
  if (msg.attachments && msg.attachments.length > 0) {
    return msg.attachments.filter((a) => a.type === 'document')
  }

  // Legacy format: documents without imageData entries are text documents
  if (msg.documents) {
    const imageCount = msg.imageData?.length ?? 0
    return msg.documents.slice(imageCount).map((doc, i) => ({
      id: `legacy-doc-${i}`,
      type: 'document' as const,
      fileName: doc.name,
      textContent: extractDocumentContent(doc.name, msg.documentContent),
    }))
  }

  return []
}

/**
 * Get all attachments from a message, handling both new and legacy formats.
 */
export function getMessageAttachments(msg: Message): Attachment[] {
  if (msg.attachments && msg.attachments.length > 0) {
    return msg.attachments
  }

  return [...getMessageImages(msg), ...getMessageDocuments(msg)]
}

/**
 * Check if a message has any attachments (new or legacy format).
 */
export function hasMessageAttachments(msg: Message): boolean {
  if (msg.attachments && msg.attachments.length > 0) return true
  if (msg.documents && msg.documents.length > 0) return true
  return false
}

/**
 * Extract a single document's text content from the legacy combined documentContent string.
 */
function extractDocumentContent(
  name: string,
  documentContent?: string,
): string | undefined {
  if (!documentContent) return undefined
  const marker = `Document title: ${name}\nDocument contents:\n`
  const idx = documentContent.indexOf(marker)
  if (idx === -1) return undefined
  const rest = documentContent.slice(idx + marker.length)
  const nextDoc = rest.indexOf('\nDocument title: ')
  return (nextDoc === -1 ? rest : rest.slice(0, nextDoc)).trim() || undefined
}
