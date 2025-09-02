'use client'

import { LoadingDots } from '@/components/loading-dots'
import { logError } from '@/utils/error-handling'
import {
  processLatexTags,
  sanitizeUnsupportedMathBlocks,
} from '@/utils/latex-processing'
import { memo, useEffect, useState } from 'react'
import { LuBrain } from 'react-icons/lu'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ThoughtProcessProps {
  thoughts: string
  isDarkMode: boolean
  isThinking?: boolean
  shouldDiscard?: boolean
  thinkingDuration?: number
  messageId?: string
  expandedThoughtsState?: Record<string, boolean>
  setExpandedThoughtsState?: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >
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
                  singleDollarTextMath: false, // Disable $ delimiter
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
                  errorColor: '#cc0000',
                  trust: false,
                },
              ],
            ] as any[],
          })
        })
        .catch((error) => {
          logError('Failed to load markdown plugins', error, {
            component: 'ThoughtProcess',
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

export const ThoughtProcess = memo(function ThoughtProcess({
  thoughts,
  isDarkMode,
  isThinking = false,
  shouldDiscard = false,
  thinkingDuration,
  messageId,
  expandedThoughtsState,
  setExpandedThoughtsState,
}: ThoughtProcessProps) {
  const isExpanded =
    messageId && expandedThoughtsState
      ? (expandedThoughtsState[messageId] ?? false)
      : false

  const handleToggle = () => {
    if (messageId && setExpandedThoughtsState) {
      setExpandedThoughtsState((prevState) => ({
        ...prevState,
        [messageId]: !prevState[messageId],
      }))
    }
  }

  const { remarkPlugins, rehypePlugins } = useMathPlugins()
  const processedThoughts = processLatexTags(thoughts)
  const sanitizedThoughts = sanitizeUnsupportedMathBlocks(processedThoughts)

  if (shouldDiscard || (!thoughts.trim() && !isThinking)) {
    return null
  }

  return (
    <div
      className={`mx-4 mb-4 mt-2 rounded-lg ${
        isDarkMode ? 'bg-gray-700/50' : 'bg-gray-100'
      }`}
    >
      <button
        type="button"
        onClick={handleToggle}
        className={`flex w-full items-center justify-between px-3.5 py-2 text-left ${
          isDarkMode
            ? 'text-gray-200 hover:bg-gray-600/50'
            : 'text-gray-700 hover:bg-gray-200'
        } rounded-lg transition-colors`}
      >
        <div className="flex items-center gap-2">
          <LuBrain className="h-5 w-5 opacity-70" aria-hidden="true" />
          {isThinking ? (
            <>
              <span className="text-sm font-medium">Thinking</span>
              <LoadingDots isThinking={true} isDarkMode={isDarkMode} />
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-sm">
                <span className="font-bold">Thought</span>
                {thinkingDuration && (
                  <span className="font-normal opacity-70">
                    {thinkingDuration < 60
                      ? ` for ${thinkingDuration.toFixed(1)} seconds`
                      : ` for ${(thinkingDuration / 60).toFixed(1)} minutes`}
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
        <svg
          className={`h-5 w-5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
          focusable="false"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      <div
        style={{
          height: isExpanded ? 'auto' : 0,
          opacity: isExpanded ? 1 : 0,
          overflow: 'hidden',
          transition: 'height 0.2s ease-in-out, opacity 0.2s ease-in-out',
        }}
      >
        <div
          className={`overflow-x-auto px-4 py-3 text-sm ${
            isDarkMode ? 'text-gray-300' : 'text-gray-600'
          }`}
        >
          <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={{
              p: ({ children }: { children?: React.ReactNode }) => (
                <p className="mb-2 break-words last:mb-0">{children}</p>
              ),
              pre: ({ children }: { children?: React.ReactNode }) => (
                <pre className="my-2 overflow-x-auto rounded-md bg-black/10 p-3 text-xs">
                  {children}
                </pre>
              ),
              code: ({
                inline,
                children,
              }: {
                inline?: boolean
                children?: React.ReactNode
              }) =>
                inline ? (
                  <code className="break-words rounded bg-black/10 px-1 py-0.5 text-xs">
                    {children}
                  </code>
                ) : (
                  <code className="block break-all text-xs">{children}</code>
                ),
            }}
          >
            {sanitizedThoughts}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
})
