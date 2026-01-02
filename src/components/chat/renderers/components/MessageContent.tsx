import { CodeBlock } from '@/components/code-block'
import {
  processLatexTags,
  sanitizeUnsupportedMathBlocks,
} from '@/utils/latex-processing'
import { preprocessMarkdown } from '@/utils/markdown-preprocessing'
import { sanitizeUrl } from '@braintree/sanitize-url'
import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import { useMathPlugins } from './use-math-plugins'

interface MessageContentProps {
  content: string
  isDarkMode: boolean
  isUser?: boolean
  isStreaming?: boolean
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
    </div>
  )
})
