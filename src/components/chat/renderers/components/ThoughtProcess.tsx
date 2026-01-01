import { LoadingDots } from '@/components/loading-dots'
import { getTinfoilClient } from '@/services/inference/tinfoil-client'
import { logError } from '@/utils/error-handling'
import {
  processLatexTags,
  sanitizeUnsupportedMathBlocks,
} from '@/utils/latex-processing'
import { preprocessMarkdown } from '@/utils/markdown-preprocessing'
import { TfTin } from '@tinfoilsh/tinfoil-icons'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useMathPlugins } from './use-math-plugins'

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
  titleModelName?: string
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
  titleModelName,
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
  const [thoughtSummary, setThoughtSummary] = useState<string>('')
  const summaryGenerationRef = useRef<Promise<void> | null>(null)
  const lastThoughtsRef = useRef<string>('')
  const isMountedRef = useRef<boolean>(true)

  const handleToggle = () => {
    if (messageId && setExpandedThoughtsState) {
      setExpandedThoughtsState((prevState) => ({
        ...prevState,
        [messageId]: !prevState[messageId],
      }))
    }
  }

  const generateSummary = useCallback(
    async (
      thoughtText: string,
      isMountedRef: React.MutableRefObject<boolean>,
    ) => {
      if (!titleModelName || !thoughtText.trim()) {
        if (isMountedRef.current) {
          setThoughtSummary('')
        }
        return
      }

      try {
        const client = await getTinfoilClient()
        const completion = await client.chat.completions.create({
          model: titleModelName,
          messages: [
            {
              role: 'system',
              content:
                'Summarize the following thought process in a brief phrase that captures the main idea.',
            },
            {
              role: 'user',
              content: thoughtText,
            },
          ],
          stream: false,
          max_tokens: 150,
        })

        const summary = completion.choices?.[0]?.message?.content?.trim() || ''
        if (isMountedRef.current) {
          setThoughtSummary(summary)
        }
      } catch (error) {
        logError('Failed to generate thought summary', error, {
          component: 'ThoughtProcess',
          action: 'generateSummary',
        })
        if (isMountedRef.current) {
          setThoughtSummary('')
        }
      }
    },
    [titleModelName],
  )

  useEffect(() => {
    if (!isThinking) {
      lastThoughtsRef.current = ''
      setThoughtSummary('')
      return
    }

    if (!thoughts.trim()) return

    const MIN_CONTENT_LENGTH = 100
    const MIN_NEW_CONTENT = 50

    if (thoughts.length < MIN_CONTENT_LENGTH) return

    const newContentLength = thoughts.length - lastThoughtsRef.current.length
    if (
      newContentLength < MIN_NEW_CONTENT &&
      lastThoughtsRef.current.length > 0
    ) {
      return
    }

    if (summaryGenerationRef.current) return

    lastThoughtsRef.current = thoughts

    summaryGenerationRef.current = generateSummary(
      thoughts,
      isMountedRef,
    ).finally(() => {
      summaryGenerationRef.current = null
    })
  }, [thoughts, isThinking, generateSummary])

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

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
  const preprocessed = preprocessMarkdown(thoughts)
  const processedThoughts = processLatexTags(preprocessed)
  const sanitizedThoughts = sanitizeUnsupportedMathBlocks(processedThoughts)

  if (shouldDiscard || (!thoughts.trim() && !isThinking)) {
    return null
  }

  return (
    <div className="mb-2 mt-2 rounded-lg border border-border-subtle bg-transparent">
      <button
        type="button"
        onClick={handleToggle}
        className="hover:bg-surface-secondary/50 flex h-10 w-full items-center justify-between rounded-lg px-4 text-left text-content-primary transition-colors"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <TfTin className="h-5 w-5 shrink-0" aria-hidden="true" />
          {isThinking ? (
            <div className="min-w-0 flex-1">
              {thoughtSummary ? (
                <span className="block animate-shimmer truncate text-sm font-medium">
                  {thoughtSummary}
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Thinking</span>
                  <LoadingDots isThinking={true} isDarkMode={isDarkMode} />
                </div>
              )}
            </div>
          ) : (
            <span className="text-sm leading-5">
              <span className="font-bold">Thought</span>
              {thinkingDuration && (
                <span className="font-normal opacity-70">
                  {thinkingDuration < 60
                    ? ` for ${thinkingDuration.toFixed(1)} seconds`
                    : ` for ${(thinkingDuration / 60).toFixed(1)} minutes`}
                </span>
              )}
            </span>
          )}
        </div>
        <svg
          className={`h-5 w-5 shrink-0 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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
          className="px-4 py-3 font-aeonik-fono text-sm text-content-primary"
        >
          <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={{
              p: ({ children }: { children?: React.ReactNode }) => (
                <p className="mb-2 break-words last:mb-0">{children}</p>
              ),
              pre: ({ children }: { children?: React.ReactNode }) => (
                <pre className="my-2 overflow-x-auto rounded-md border border-border-subtle bg-surface-chat p-3 font-mono text-xs text-content-primary">
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
                  <code className="inline break-words rounded border border-border-subtle bg-surface-chat px-1 py-0.5 align-baseline font-mono text-xs text-content-primary">
                    {children}
                  </code>
                ) : (
                  <code className="block break-all font-mono text-xs text-content-primary">
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
