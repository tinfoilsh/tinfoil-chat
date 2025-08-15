/**
 * Input sanitization utilities for preventing XSS attacks
 */

/**
 * Sanitizes user input to prevent XSS attacks while preserving safe markdown formatting
 * @param input - The user input to sanitize
 * @returns Sanitized input safe for rendering
 */
export function sanitizeUserInput(input: string): string {
  if (!input) return ''

  // Remove any script tags and their content
  let sanitized = input.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    '',
  )

  // Remove any on* event handlers
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '')

  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '')

  // Remove data: protocol for potentially dangerous content
  sanitized = sanitized.replace(/data:text\/html/gi, '')

  // Remove iframe tags
  sanitized = sanitized.replace(
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    '',
  )

  // Remove object and embed tags
  sanitized = sanitized.replace(
    /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
    '',
  )
  sanitized = sanitized.replace(/<embed\b[^>]*>/gi, '')

  return sanitized
}

/**
 * Validates and sanitizes URLs to prevent javascript: and data: protocols
 * @param url - The URL to validate
 * @returns Sanitized URL or empty string if invalid
 */
export function sanitizeUrl(url: string): string {
  if (!url) return ''

  const trimmedUrl = url.trim().toLowerCase()

  // Block dangerous protocols
  const dangerousProtocols = [
    'javascript:',
    'data:text/html',
    'vbscript:',
    'file:',
    'about:',
  ]

  for (const protocol of dangerousProtocols) {
    if (trimmedUrl.startsWith(protocol)) {
      return ''
    }
  }

  // Allow only safe protocols
  const safeProtocols = ['http://', 'https://', 'mailto:', 'tel:']
  const hasProtocol = safeProtocols.some((p) => trimmedUrl.startsWith(p))

  // If no protocol, assume https://
  if (!hasProtocol && !trimmedUrl.startsWith('//')) {
    return `https://${url}`
  }

  return url
}

/**
 * Escapes HTML entities to prevent XSS when displaying raw text
 * @param text - The text to escape
 * @returns Escaped text safe for HTML display
 */
export function escapeHtml(text: string): string {
  if (!text) return ''

  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  }

  return text.replace(/[&<>"'/]/g, (match) => htmlEscapes[match] || match)
}

/**
 * Validates file uploads to prevent malicious files
 * @param file - The file to validate
 * @returns Boolean indicating if the file is safe
 */
export function validateFileUpload(file: File): {
  valid: boolean
  error?: string
} {
  // Max file size: 50MB
  const maxSize = 50 * 1024 * 1024

  if (file.size > maxSize) {
    return { valid: false, error: 'File size exceeds 50MB limit' }
  }

  // Allowed MIME types
  const allowedTypes = [
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
  ]

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'File type not allowed' }
  }

  // Check file extension matches MIME type
  const extension = file.name.split('.').pop()?.toLowerCase()
  const expectedExtensions: Record<string, string[]> = {
    'application/pdf': ['pdf'],
    'text/plain': ['txt'],
    'text/markdown': ['md', 'markdown'],
    'text/csv': ['csv'],
    'application/json': ['json'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
      'docx',
    ],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
      'xlsx',
    ],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      ['pptx'],
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/gif': ['gif'],
    'image/webp': ['webp'],
    'image/svg+xml': ['svg'],
  }

  const validExtensions = expectedExtensions[file.type]
  if (!extension || !validExtensions?.includes(extension)) {
    return { valid: false, error: 'File extension does not match file type' }
  }

  return { valid: true }
}
