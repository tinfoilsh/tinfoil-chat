'use client'

import { CodeBlock } from '@/components/code-block'
import { logError } from '@/utils/error-handling'
import {
  processLatexTags,
  sanitizeUnsupportedMathBlocks,
} from '@/utils/latex-processing'
import { memo, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

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
              remarkMathMod.default,
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
                  errorColor: '#cc0000',
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
          // Keep default plugins as fallback
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
  const processedContent = processLatexTags(content)
  const sanitizedContent = sanitizeUnsupportedMathBlocks(processedContent)

  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={{
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
              <code className={`${className || ''} break-words`} {...props}>
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
                className={`divide-y ${isDarkMode ? 'divide-gray-600' : 'divide-gray-200'}`}
                style={{ minWidth: 'max-content' }}
              >
                {children}
              </table>
            </div>
          )
        },
        thead({ children, node, ...props }: any) {
          return (
            <thead
              {...props}
              className={isDarkMode ? 'bg-gray-700' : 'bg-gray-50'}
            >
              {children}
            </thead>
          )
        },
        tbody({ children, node, ...props }: any) {
          return (
            <tbody
              {...props}
              className={`divide-y ${isDarkMode ? 'divide-gray-700 bg-gray-800' : 'divide-gray-200 bg-white'}`}
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
              className={`whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}
            >
              {children}
            </th>
          )
        },
        td({ children, node, ...props }: any) {
          return (
            <td
              {...props}
              className={`px-4 py-3 text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-900'} whitespace-nowrap`}
            >
              {children}
            </td>
          )
        },
      }}
    >
      {sanitizedContent}
    </ReactMarkdown>
  )
})
