/**
 * LaTeX processing utilities for chat messages
 */

// Regex to match code blocks that should be preserved without processing
const CODE_BLOCK_SPLITTER = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g

// Check if LaTeX content appears to be document-level LaTeX (not math)
export function isUnsupportedLatex(content: string): boolean {
  // Common document-level LaTeX patterns that KaTeX doesn't support
  // Note: Do NOT treat inline text macros (\text..., \textcolor) as document-level
  // and avoid blocking array-related commands like \hline/\cline/\multicolumn
  const documentPatterns = [
    /\\usepackage/,
    /\\documentclass/,
    /\\section/,
    /\\chapter/,
    /\\item\s/,
    /\\caption/,
    /\\label/,
    /\\ref/,
    /\\cite/,
    /\\bibliography/,
    /\\centering/,
  ]

  // First, check for specific supported math environments
  const supportedMathEnvironments = [
    'matrix',
    'pmatrix',
    'bmatrix',
    'vmatrix',
    'Vmatrix',
    'cases',
    'aligned',
    'align',
    'alignat',
    'gather',
    'gathered',
    'array',
    'split',
    'equation',
    'multline',
    'subarray',
  ]

  // Find all \begin{...} environments in the content
  const envMatches = content.match(/\\begin\{([a-zA-Z]+)\*?\}/g) || []
  const environments = envMatches
    .map((match) => {
      const envName = match.match(/\\begin\{([a-zA-Z]+)\*?\}/)
      return envName ? envName[1] : null
    })
    .filter(Boolean)

  // Check if ALL environments are supported math environments
  const hasOnlyMathEnvironments =
    environments.length > 0 &&
    environments.every((env) => supportedMathEnvironments.includes(env!))

  // If there are environments and they're NOT all math environments, it's unsupported
  if (environments.length > 0 && !hasOnlyMathEnvironments) {
    return true
  }

  // Check for document-level LaTeX patterns
  // If any document-level pattern is found, it's unsupported
  const hasDocumentLatex = documentPatterns.some((pattern) =>
    pattern.test(content),
  )

  if (hasDocumentLatex) {
    return true // It's document-level LaTeX
  }

  return false
}

// Process LaTeX content for proper rendering
// Convert \[...\] to $$ blocks and \(...\) outside of those blocks to inline $$ delimiters
export function processLatexTags(text: string): string {
  const parts = text.split(CODE_BLOCK_SPLITTER)

  return parts
    .map((part) => {
      const isCodeBlock =
        part.startsWith('```') ||
        part.startsWith('~~~') ||
        (part.startsWith('`') && part.endsWith('`'))
      if (isCodeBlock) return part

      return transformMathDelimiters(part)
    })
    .join('')
}

function transformMathDelimiters(content: string): string {
  let result = ''
  let index = 0
  let lastIndex = 0

  while (index < content.length) {
    const isDisplayOpen =
      content[index] === '\\' &&
      content[index + 1] === '[' &&
      !isEscapedDelimiter(content, index)

    if (!isDisplayOpen) {
      index += 1
      continue
    }

    const closeIndex = findMatchingDisplayClose(content, index + 2)

    if (closeIndex === -1) {
      index += 2
      continue
    }

    const before = content.slice(lastIndex, index)
    if (before) {
      result += convertInlineMath(before)
    }

    const inner = content.slice(index + 2, closeIndex).trim()
    result += `\n\n$$\n${inner}\n$$\n\n`

    index = closeIndex + 2
    lastIndex = index
  }

  const remaining = content.slice(lastIndex)
  if (remaining) {
    result += convertInlineMath(remaining)
  }

  return result
}

function findMatchingDisplayClose(segment: string, startIndex: number): number {
  let index = startIndex

  while (index < segment.length) {
    if (
      segment[index] === '\\' &&
      segment[index + 1] === ']' &&
      !isEscapedDelimiter(segment, index)
    ) {
      return index
    }

    index += 1
  }

  return -1
}

function convertInlineMath(segment: string): string {
  let output = ''
  let index = 0

  while (index < segment.length) {
    const isPotentialOpen =
      segment[index] === '\\' &&
      segment[index + 1] === '(' &&
      !isEscapedDelimiter(segment, index)

    if (!isPotentialOpen) {
      output += segment[index]
      index += 1
      continue
    }

    const start = index + 2
    const closeIndex = findMatchingInlineClose(segment, start)

    if (closeIndex === -1) {
      output += segment[index]
      index += 1
      continue
    }

    const inner = segment.slice(start, closeIndex)
    output += `$$${inner}$$`
    index = closeIndex + 2
  }

  return output
}

function findMatchingInlineClose(segment: string, startIndex: number): number {
  let depth = 0
  let index = startIndex

  while (index < segment.length) {
    const isBackslash = segment[index] === '\\'
    const nextChar = isBackslash ? segment[index + 1] : undefined

    if (
      isBackslash &&
      nextChar === '(' &&
      !isEscapedDelimiter(segment, index)
    ) {
      depth += 1
      index += 2
      continue
    }

    if (
      isBackslash &&
      nextChar === ')' &&
      !isEscapedDelimiter(segment, index)
    ) {
      if (depth === 0) {
        return index
      }

      depth -= 1
      index += 2
      continue
    }

    index += 1
  }

  return -1
}

function isEscapedDelimiter(segment: string, delimiterIndex: number): boolean {
  let backslashCount = 0
  let index = delimiterIndex - 1

  while (index >= 0 && segment[index] === '\\') {
    backslashCount += 1
    index -= 1
  }

  return backslashCount % 2 === 1
}

// Convert LaTeX content for copying
// Currently a pass-through - maintains consistency with processLatexTags
// Does NOT wrap content in $$ to avoid breaking unsupported LaTeX
export function convertLatexForCopy(text: string): string {
  return text
}

// Clean up common LaTeX issues that break KaTeX rendering
export function sanitizeUnsupportedMathBlocks(text: string): string {
  // Preserve code blocks as-is
  const parts = text.split(CODE_BLOCK_SPLITTER)

  // Simple cleanup for unsupported commands within math content
  const sanitizeMathContent = (content: string): string => {
    let out = content
    // Remove labels (KaTeX doesn't process \label)
    out = out.replace(/\\label\{[^}]*\}/g, '')
    // KaTeX doesn't support these, so just remove them
    out = out.replace(/\\omicron/g, 'o')
    out = out.replace(/\\circled\{([^}]*)\}/g, '$1')
    // Replace unsupported \mathscr with \mathcal (similar style)
    out = out.replace(/\\mathscr\{([^}]*)\}/g, '\\mathcal{$1}')
    return out
  }

  return parts
    .map((part) => {
      const isCodeBlock =
        part.startsWith('```') ||
        part.startsWith('~~~') ||
        (part.startsWith('`') && part.endsWith('`'))
      if (isCodeBlock) return part

      let transformed = part

      // Clean up $$...$$ blocks (which now include converted \[...\] and \(...\))
      transformed = transformed.replace(
        /\$\$([\s\S]*?)\$\$/g,
        (_m, inner: string) => {
          return '$$' + sanitizeMathContent(inner) + '$$'
        },
      )

      return transformed
    })
    .join('')
}
