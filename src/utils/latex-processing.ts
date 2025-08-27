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
// Currently a pass-through - LaTeX delimiters are handled by remark-math/rehype-katex
export function processLatexTags(text: string): string {
  return text
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

      // Clean up display math $$...$$ and \[...\]
      transformed = transformed.replace(
        /\$\$([\s\S]*?)\$\$/g,
        (_m, inner: string) => {
          return '$$' + sanitizeMathContent(inner) + '$$'
        },
      )
      transformed = transformed.replace(
        /\\\[([\s\S]*?)\\\]/g,
        (_m, inner: string) => {
          return '\\[' + sanitizeMathContent(inner) + '\\]'
        },
      )

      // Clean up inline math $...$ and \(...\)
      // Match $ that are not escaped (not preceded by \) and not doubled ($$)
      transformed = transformed.replace(
        /(^|[^\\$])\$(?!\$)((?:[^$\\]|\\[^$]|\\$)*?)\$(?!\$)/g,
        (_m, prefix: string, inner: string) => {
          return prefix + '$' + sanitizeMathContent(inner) + '$'
        },
      )
      transformed = transformed.replace(
        /\\\(([\s\S]*?)\\\)/g,
        (_m, inner: string) => {
          return '\\(' + sanitizeMathContent(inner) + '\\)'
        },
      )

      return transformed
    })
    .join('')
}
