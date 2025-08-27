/**
 * LaTeX processing utilities for chat messages
 */

// Check if LaTeX content appears to be document-level LaTeX (not math)
export function isUnsupportedLatex(content: string): boolean {
  // Common document-level LaTeX patterns that KaTeX doesn't support
  const documentPatterns = [
    /\\begin\{[a-zA-Z]+\*?\}/, // Any \begin{environment} (we'll allow specific math ones below)
    /\\end\{[a-zA-Z]+\*?\}/, // Any \end{environment}
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
    // Note: Do NOT treat inline text macros (\text..., \textcolor) as document-level
    // and avoid blocking array-related commands like \hline/\cline/\multicolumn
  ]

  // Check if it contains document-level LaTeX
  const hasDocumentLatex = documentPatterns.some((pattern) =>
    pattern.test(content),
  )
  if (hasDocumentLatex) {
    // But allow certain math environments that KaTeX does support
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

    // Check if it's actually a supported math environment
    const envMatch = content.match(/\\begin\{([a-zA-Z]+)\*?\}/)
    if (envMatch && supportedMathEnvironments.includes(envMatch[1])) {
      return false // It's a supported math environment
    }

    return true // It's document-level LaTeX
  }

  return false
}

// Process LaTeX content for proper rendering
export function processLatexTags(text: string): string {
  return text
}

// Convert LaTeX content for copying
export function convertLatexForCopy(text: string): string {
  return text
}

// Clean up common LaTeX issues that break KaTeX rendering
export function sanitizeUnsupportedMathBlocks(text: string): string {
  // Preserve code blocks as-is
  const splitter = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g
  const parts = text.split(splitter)

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
      transformed = transformed.replace(
        /(^|[^$])\$(?!\$)([\s\S]*?)\$(?!\$)/g,
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
