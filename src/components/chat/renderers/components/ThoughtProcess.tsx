'use client'

import { LoadingDots } from '@/components/loading-dots'
import { logError } from '@/utils/error-handling'
import {
  processLatexTags,
  sanitizeUnsupportedMathBlocks,
} from '@/utils/latex-processing'
import { memo, useEffect, useRef, useState } from 'react'
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

  const contentRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState<number>(0)
  const lastScrollPositionRef = useRef<number>(0)
  const isUserScrollingRef = useRef<boolean>(false)

  const handleToggle = () => {
    if (messageId && setExpandedThoughtsState) {
      setExpandedThoughtsState((prevState) => ({
        ...prevState,
        [messageId]: !prevState[messageId],
      }))
    }
  }

  // Fix main scroll container when thoughts collapse
  useEffect(() => {
    if (!isExpanded && typeof window !== 'undefined') {
      // When thoughts collapse, check if main scroll needs adjustment
      const checkAndFixScroll = () => {
        const mainScrollContainer = document.querySelector(
          '[data-scroll-container="main"]',
        ) as HTMLElement
        if (mainScrollContainer) {
          // Use requestAnimationFrame to ensure DOM has updated
          requestAnimationFrame(() => {
            const { scrollHeight, clientHeight, scrollTop } =
              mainScrollContainer
            const maxScroll = Math.max(0, scrollHeight - clientHeight)

            // If we're scrolled beyond actual content, reset
            if (scrollTop > maxScroll) {
              mainScrollContainer.scrollTop = maxScroll
            }

            // Trigger scroll event to update button
            mainScrollContainer.dispatchEvent(new Event('scroll'))
          })
        }
      }

      // Check immediately and after transition
      checkAndFixScroll()
      const timeoutId = setTimeout(checkAndFixScroll, 350)

      return () => clearTimeout(timeoutId)
    }
  }, [isExpanded])

  // Track user scrolling
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer || !isExpanded) return

    let scrollTimeout: ReturnType<typeof setTimeout>

    const handleScroll = () => {
      isUserScrollingRef.current = true
      lastScrollPositionRef.current = scrollContainer.scrollTop

      clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(() => {
        isUserScrollingRef.current = false
      }, 150)
    }

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll)
      clearTimeout(scrollTimeout)
    }
  }, [isExpanded])

  // Preserve scroll position during streaming updates
  useEffect(() => {
    if (
      isExpanded &&
      scrollContainerRef.current &&
      isThinking &&
      !isUserScrollingRef.current
    ) {
      // Restore scroll position after content update
      const scrollContainer = scrollContainerRef.current
      if (lastScrollPositionRef.current > 0) {
        scrollContainer.scrollTop = lastScrollPositionRef.current
      }
    }
  }, [thoughts, isExpanded, isThinking])

  // Reset max height when thinking stops
  useEffect(() => {
    if (!isThinking && contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight)
    }
  }, [isThinking])

  // Measure content height for smooth animation
  useEffect(() => {
    if (contentRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        if (contentRef.current) {
          setContentHeight((prevHeight) => {
            const newHeight = contentRef.current!.scrollHeight
            // During streaming (isThinking), only allow height to grow, never shrink
            // This prevents scroll resets when content temporarily contracts
            if (isThinking) {
              return Math.max(prevHeight, newHeight)
            }
            return newHeight
          })
        }
      })
      resizeObserver.observe(contentRef.current)
      return () => resizeObserver.disconnect()
    }
  }, [thoughts, isThinking])

  const { remarkPlugins, rehypePlugins } = useMathPlugins()
  const processedThoughts = processLatexTags(thoughts)
  const sanitizedThoughts = sanitizeUnsupportedMathBlocks(processedThoughts)

  if (shouldDiscard || (!thoughts.trim() && !isThinking)) {
    return null
  }

  return (
    <div
      className={`mb-2 mt-2 rounded-lg ${
        isDarkMode ? 'bg-gray-700/50' : 'bg-gray-100'
      }`}
    >
      <button
        type="button"
        onClick={handleToggle}
        className={`flex h-10 w-full items-center justify-between px-4 text-left ${
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
        ref={scrollContainerRef}
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{
          maxHeight: isExpanded ? `${contentHeight}px` : '0px',
        }}
      >
        <div
          ref={contentRef}
          className={`px-4 py-3 font-aeonik-fono text-sm ${
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
                <pre className="my-2 overflow-x-auto rounded-md bg-black/10 p-3 font-mono text-xs">
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
                  <code className="break-words rounded bg-black/10 px-1 py-0.5 font-mono text-xs">
                    {children}
                  </code>
                ) : (
                  <code className="block break-all font-mono text-xs">
                    {children}
                  </code>
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
