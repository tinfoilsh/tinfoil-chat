/**
 * Centralized file type detection utilities
 */

// Supported image extensions
const IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.tiff',
  '.tif',
]

// Supported document extensions
const DOCUMENT_EXTENSIONS = {
  pdf: ['.pdf'],
  docx: ['.doc', '.docx'],
  pptx: ['.ppt', '.pptx'],
  xlsx: ['.xls', '.xlsx'],
  csv: ['.csv'],
}

// Supported media extensions
const MEDIA_EXTENSIONS = {
  audio: ['.mp3', '.wav', '.ogg'],
  video: ['.mp4', '.mov', '.avi'],
}

// Supported code extensions
const CODE_EXTENSIONS = {
  html: ['.html', '.htm'],
  js: ['.js', '.jsx'],
  ts: ['.ts', '.tsx'],
  css: ['.css'],
  md: ['.md'],
  txt: ['.txt'],
}

// Archive extensions
const ARCHIVE_EXTENSIONS = ['.zip', '.rar', '.tar']

/**
 * Checks if a filename has an image extension
 * @param filename - The filename to check
 * @returns true if the file has an image extension
 */
export function hasImageExtension(filename: string): boolean {
  const lowerFilename = filename.toLowerCase()
  return IMAGE_EXTENSIONS.some((ext) => lowerFilename.endsWith(ext))
}

/**
 * Gets the file icon type based on the filename
 * @param filename - The filename to check
 * @returns A string representing the file type for icon display
 */
export function getFileIconType(filename: string): string {
  const lowerFilename = filename.toLowerCase()

  // Check document types
  for (const [type, extensions] of Object.entries(DOCUMENT_EXTENSIONS)) {
    if (extensions.some((ext) => lowerFilename.endsWith(ext))) {
      return type
    }
  }

  // Check if it's an image
  if (hasImageExtension(filename)) {
    return 'image'
  }

  // Check media types
  for (const [type, extensions] of Object.entries(MEDIA_EXTENSIONS)) {
    if (extensions.some((ext) => lowerFilename.endsWith(ext))) {
      return type
    }
  }

  // Check archive types
  if (ARCHIVE_EXTENSIONS.some((ext) => lowerFilename.endsWith(ext))) {
    return 'zip'
  }

  // Check code types
  for (const [type, extensions] of Object.entries(CODE_EXTENSIONS)) {
    if (extensions.some((ext) => lowerFilename.endsWith(ext))) {
      return type
    }
  }

  // Default
  return 'file'
}

/**
 * Gets the format type for document processing based on filename
 * @param filename - The filename to check
 * @returns A string representing the format for document processing
 */
export function getDocumentFormat(filename: string): string {
  const lowerFilename = filename.toLowerCase()

  if (lowerFilename.endsWith('.pdf')) return 'pdf'
  if (lowerFilename.endsWith('.docx') || lowerFilename.endsWith('.doc'))
    return 'docx'
  if (lowerFilename.endsWith('.pptx') || lowerFilename.endsWith('.ppt'))
    return 'pptx'
  if (lowerFilename.endsWith('.html') || lowerFilename.endsWith('.htm'))
    return 'html'
  if (lowerFilename.endsWith('.md')) return 'md'
  if (lowerFilename.endsWith('.csv')) return 'csv'
  if (lowerFilename.endsWith('.xlsx') || lowerFilename.endsWith('.xls'))
    return 'xlsx'
  if (hasImageExtension(filename)) return 'image'
  if (lowerFilename.endsWith('.txt')) return 'asciidoc'

  // Default to pdf if we can't determine
  return 'pdf'
}
