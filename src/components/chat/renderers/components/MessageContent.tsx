'use client'

import { CodeBlock } from '@/components/code-block'
import { TINFOIL_COLORS } from '@/theme/colors'
import { logError } from '@/utils/error-handling'
import {
  processLatexTags,
  sanitizeUnsupportedMathBlocks,
} from '@/utils/latex-processing'
import { memo, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Converts HTML tags to markdown equivalents for safe rendering
 */
function preprocessHtmlToMarkdown(content: string): string {
  let processed = content

  // Convert <a href="url">text</a> to [text](url)
  // This handles various formats: href="url", href='url', and additional attributes
  processed = processed.replace(
    /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi,
    (match, url, text) => {
      // If text is empty, use the URL as text
      const linkText = text.trim() || url
      return `[${linkText}](${url})`
    },
  )

  // Convert <b>text</b> and <strong>text</strong> to **text**
  processed = processed.replace(/<b>([^<]*)<\/b>/gi, '**$1**')
  processed = processed.replace(/<strong>([^<]*)<\/strong>/gi, '**$1**')

  // Convert <br>, <br/>, and </br> to markdown line breaks
  // Using double space + newline for proper markdown rendering
  processed = processed.replace(/<br\s*\/?>/gi, '  \n')
  processed = processed.replace(/<\/br>/gi, '  \n')

  return processed
}

interface MessageContentProps {
  content: string
  isDarkMode: boolean
  isUser?: boolean
}

function useMathPlugins() {
  const [plugins, setPlugins] = useState<{
    remarkPlugins: any[]
    rehypePlugins: any[]
  }>({
    remarkPlugins: [remarkGfm],
    rehypePlugins: [],
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      Promise.all([
        import('remark-math'),
        import('rehype-katex'),
        import('remark-breaks'),
      ])
        .then(([remarkMathMod, rehypeKatexMod, remarkBreaksMod]) => {
          setPlugins({
            remarkPlugins: [
              [
                remarkMathMod.default,
                {
                  singleDollarTextMath: false,
                },
              ],
              remarkGfm,
              remarkBreaksMod.default,
            ] as any[],
            rehypePlugins: [
              [
                rehypeKatexMod.default,
                {
                  throwOnError: false,
                  strict: false,
                  output: 'htmlAndMathml',
                  errorColor: TINFOIL_COLORS.utility.destructive,
                  trust: false,
                },
              ],
            ] as any[],
          })
        })
        .catch((error) => {
          logError('Failed to load markdown plugins', error, {
            component: 'MessageContent',
            action: 'loadPlugins',
            metadata: {
              plugins: ['remark-math', 'rehype-katex', 'remark-breaks'],
            },
          })
        })
    }
  }, [])

  return plugins
}

export const MessageContent = memo(function MessageContent({
  content,
  isDarkMode,
  isUser = false,
}: MessageContentProps) {
  const { remarkPlugins, rehypePlugins } = useMathPlugins()
  const htmlToMarkdown = preprocessHtmlToMarkdown(content)
  const processedContent = processLatexTags(htmlToMarkdown)
  const sanitizedContent = sanitizeUnsupportedMathBlocks(processedContent)

  // For user messages, render as plain text without markdown processing
  if (isUser) {
    return <div className="whitespace-pre-wrap break-words">{content}</div>
  }

  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={{
        hr: () => null, // Don't render horizontal rules
        code({
          node,
          className,
          children,
          ...props
        }: {
          node?: unknown
          className?: string
          children?: React.ReactNode
          inline?: boolean
        } & React.HTMLAttributes<HTMLElement>) {
          // Only handle inline code here, let pre handle block code
          if (props.inline) {
            return (
              <code
                className={`${className || ''} bg-surface-secondary break-words rounded px-1.5 py-0.5 font-mono text-sm text-content-primary`}
                {...props}
              >
                {children}
              </code>
            )
          }
          // For block code, just return the code element as-is
          // The pre component will handle rendering it as a CodeBlock
          return (
            <code className={className} {...props}>
              {children}
            </code>
          )
        },
        // Override pre to render CodeBlock directly for fenced code blocks
        pre({ children, ...props }: { children?: React.ReactNode }) {
          // Extract code content and language from the pre > code structure
          if (
            children &&
            typeof children === 'object' &&
            'props' in (children as any)
          ) {
            const codeProps = (children as any).props
            const className = codeProps?.className || ''
            const match = /language-([\w+#-]+)/.exec(className)
            const language = match ? match[1] : 'text'
            const code = String(codeProps?.children || '').replace(/\n$/, '')

            return (
              <CodeBlock
                code={code}
                language={language}
                isDarkMode={isDarkMode}
              />
            )
          }
          // Fallback to default pre rendering
          return <pre {...props}>{children}</pre>
        },
        table({ children, node, ...props }: any) {
          return (
            <div className="my-4 w-full overflow-x-auto">
              <table
                {...props}
                className="divide-y divide-border-subtle"
                style={{ minWidth: 'max-content' }}
              >
                {children}
              </table>
            </div>
          )
        },
        thead({ children, node, ...props }: any) {
          return (
            <thead {...props} className="bg-surface-secondary">
              {children}
            </thead>
          )
        },
        tbody({ children, node, ...props }: any) {
          return (
            <tbody
              {...props}
              className="bg-surface-primary divide-y divide-border-subtle"
            >
              {children}
            </tbody>
          )
        },
        tr({ children, node, ...props }: any) {
          return <tr {...props}>{children}</tr>
        },
        th({ children, node, ...props }: any) {
          return (
            <th
              {...props}
              className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-content-primary"
              style={{
                maxWidth: '300px',
                wordWrap: 'break-word',
                whiteSpace: 'normal',
              }}
            >
              {children}
            </th>
          )
        },
        td({ children, node, ...props }: any) {
          return (
            <td
              {...props}
              className="px-4 py-3 text-sm text-content-primary"
              style={{
                maxWidth: '300px',
                wordWrap: 'break-word',
                whiteSpace: 'normal',
              }}
            >
              {children}
            </td>
          )
        },
        blockquote({ children, ...props }: any) {
          return (
            <blockquote
              {...props}
              className="my-4 border-l-4 border-border-subtle pl-4 text-content-primary"
            >
              {children}
            </blockquote>
          )
        },
        a({ children, href, ...props }: any) {
          return (
            <a
              {...props}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline hover:text-blue-600"
            >
              {children}
            </a>
          )
        },
        strong({ children, ...props }: any) {
          return (
            <strong {...props} className="font-semibold">
              {children}
            </strong>
          )
        },
        b({ children, ...props }: any) {
          return (
            <b {...props} className="font-semibold">
              {children}
            </b>
          )
        },
        br({ ...props }: any) {
          return <br {...props} />
        },
      }}
    >
      {sanitizedContent}
    </ReactMarkdown>
  )
})
