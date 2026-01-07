import { CodeBlock } from '@/components/code-block'
import {
  processLatexTags,
  sanitizeUnsupportedMathBlocks,
} from '@/utils/latex-processing'
import { preprocessMarkdown } from '@/utils/markdown-preprocessing'
import { sanitizeUrl } from '@braintree/sanitize-url'
import { memo, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { GeneratingTable } from './GeneratingTable'
import { useMathPlugins } from './use-math-plugins'

function getFaviconUrl(url: string): string {
  try {
    const parsedUrl = new URL(url)
    return `https://www.google.com/s2/favicons?sz=32&domain=${parsedUrl.hostname}`
  } catch {
    return ''
  }
}

function getDomainName(url: string): string {
  try {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname.replace(/^www\./, '')
    const parts = hostname.split('.')
    return parts.length > 1 ? parts[parts.length - 2] : hostname
  } catch {
    return ''
  }
}

function CitationPill({ url }: { url: string }) {
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const sanitizedHref = sanitizeUrl(url)
  const domain = getDomainName(url)

  return (
    <a
      href={sanitizedHref}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-surface-secondary hover:bg-surface-tertiary mx-0.5 inline-flex items-center gap-1 rounded-full border border-border-subtle px-2 py-0.5 align-baseline text-xs text-content-secondary transition-colors"
    >
      {!imgError && (
        <img
          src={getFaviconUrl(url)}
          alt=""
          className={`h-3 w-3 rounded-full transition-opacity ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
        />
      )}
      <span>{domain}</span>
    </a>
  )
}

interface MessageContentProps {
  content: string
  isDarkMode: boolean
  isUser?: boolean
  isStreaming?: boolean
}

// Check if content has an incomplete markdown code block with a table inside
function hasStreamingMarkdownTableCodeBlock(content: string): boolean {
  // Look for ```markdown or ```md that's incomplete (no closing ```)
  const markdownBlockMatch = content.match(/```(?:markdown|md)\n([\s\S]*)$/)
  if (!markdownBlockMatch) return false

  const blockContent = markdownBlockMatch[1]
  // Check if block is incomplete (no closing ```)
  if (blockContent.includes('```')) return false

  // Check if there's a table inside (header + separator)
  const lines = blockContent.split('\n')
  let hasHeader = false
  let hasSeparator = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      hasHeader = true
    }
    if (/^\|[\s\-:|]+\|$/.test(trimmed) && trimmed.includes('-')) {
      hasSeparator = true
    }
  }
  return hasHeader && hasSeparator
}

export const MessageContent = memo(function MessageContent({
  content,
  isDarkMode,
  isUser = false,
  isStreaming = false,
}: MessageContentProps) {
  const { remarkPlugins, rehypePlugins } = useMathPlugins()
  const preprocessed = preprocessMarkdown(content)
  const processedContent = processLatexTags(preprocessed)
  const sanitizedContent = sanitizeUnsupportedMathBlocks(processedContent)

  // Detect if we're streaming a markdown code block with a table
  const showMarkdownTablePlaceholder = useMemo(() => {
    if (!isStreaming) return false
    return hasStreamingMarkdownTableCodeBlock(content)
  }, [isStreaming, content])

  // For user messages, render as plain text without markdown processing
  if (isUser) {
    return <div className="whitespace-pre-wrap break-words">{content}</div>
  }

  // translate="no" prevents Google Translate from modifying the DOM,
  // which would cause React reconciliation errors
  return (
    <div translate="no">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{
          hr: () => null,
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
                  className={`${className || ''} bg-surface-secondary inline break-words rounded px-1.5 py-0.5 align-baseline font-mono text-sm text-content-primary`}
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

              // If this is a markdown code block with a table during streaming,
              // don't render it - the placeholder is rendered outside ReactMarkdown
              if (
                showMarkdownTablePlaceholder &&
                (language === 'markdown' || language === 'md')
              ) {
                return null
              }

              return (
                <CodeBlock
                  code={code}
                  language={language}
                  isDarkMode={isDarkMode}
                  isStreaming={isStreaming}
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
            // Check for citation link format: #cite-N|url
            if (href?.startsWith('#cite-')) {
              const pipeIndex = href.indexOf('|')
              if (pipeIndex !== -1) {
                const url = href.slice(pipeIndex + 1)
                return <CitationPill url={url} />
              }
            }
            const sanitizedHref = sanitizeUrl(href)
            return (
              <a
                {...props}
                href={sanitizedHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline align-baseline text-blue-500 underline hover:text-blue-600"
              >
                {children}
              </a>
            )
          },
          strong({ children, ...props }: any) {
            return (
              <strong
                {...props}
                className="inline align-baseline font-semibold"
              >
                {children}
              </strong>
            )
          },
          b({ children, ...props }: any) {
            return (
              <b {...props} className="inline align-baseline font-semibold">
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
      {showMarkdownTablePlaceholder && <GeneratingTable />}
    </div>
  )
})
