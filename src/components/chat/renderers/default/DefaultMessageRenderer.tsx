import { GenUIToolCallRenderer } from '@/components/chat/genui/GenUIToolCallRenderer'
import { StreamingTracer } from '@/components/streaming-tracer'
import { cn } from '@/components/ui/utils'
import {
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  ChevronDownIcon,
  InformationCircleIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline'
import React, { memo, useState } from 'react'
import { BsCheckLg } from 'react-icons/bs'
import { GoClockFill } from 'react-icons/go'
import { RxCopy } from 'react-icons/rx'
import { hasMessageAttachments } from '../../attachment-helpers'
import { CHAT_FONT_CLASSES, useChatFont } from '../../hooks/use-chat-font'
import { DocumentList } from '../components/DocumentList'
import { MessageActions } from '../components/MessageActions'
import { SourcesButton } from '../components/SourcesButton'
import { StreamingChunkedText } from '../components/StreamingChunkedText'
import { StreamingContentWrapper } from '../components/StreamingContentWrapper'
import { ThoughtProcess } from '../components/ThoughtProcess'
import { URLFetchProcess } from '../components/URLFetchProcess'
import { WebSearchProcess } from '../components/WebSearchProcess'
import type { MessageRenderer, MessageRenderProps } from '../types'

// Vertical rhythm between consecutive event/content rows (thoughts,
// web searches, URL fetches, streamed text). Kept in one place so all
// rows stay visually in sync.
const EVENT_STACK_CLASSES = 'flex flex-col gap-2'

const DefaultMessageComponent = ({
  message,
  messageIndex,
  isDarkMode,
  isLastMessage,
  isStreaming,
  expandedThoughtsState,
  setExpandedThoughtsState,
  onEditMessage,
  onRegenerateMessage,
}: MessageRenderProps) => {
  const isUser = message.role === 'user'
  const chatFont = useChatFont()
  const [isEditing, setIsEditing] = React.useState(false)
  const [editContent, setEditContent] = React.useState(message.content || '')
  const [copiedUser, setCopiedUser] = React.useState(false)
  const [isUserMessageExpanded, setIsUserMessageExpanded] =
    React.useState(false)
  const [isUserMessageOverflowing, setIsUserMessageOverflowing] =
    React.useState(false)
  const userMessageContentRef = React.useRef<HTMLDivElement>(null)
  const editTextareaRef = React.useRef<HTMLTextAreaElement>(null)

  // Generate a stable unique ID for this message
  const messageUniqueId = React.useMemo(() => {
    const timestamp = message.timestamp
      ? message.timestamp instanceof Date
        ? message.timestamp.getTime()
        : String(message.timestamp)
      : Date.now()
    return `${message.role}-${timestamp}`
  }, [message.role, message.timestamp])
  const citationUrlTitles = React.useMemo(() => {
    if (!message.annotations || message.annotations.length === 0)
      return undefined
    const map = new Map<string, string>()
    for (const annotation of message.annotations) {
      const { url, title } = annotation.url_citation
      if (url) map.set(url, title || '')
    }
    return map.size > 0 ? map : undefined
  }, [message.annotations])
  const [showActions, setShowActions] = React.useState(false)
  const lastContentRef = React.useRef(message.content)
  const showActionsTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null)
  const hasInitialized = React.useRef(false)

  // Track if thoughts have ever been shown during streaming to keep wrapper stable
  const hasShownThoughts = React.useRef(false)
  React.useEffect(() => {
    if (
      message.thoughts &&
      (message.isThinking || (isLastMessage && isStreaming))
    ) {
      hasShownThoughts.current = true
    }
  }, [message.thoughts, message.isThinking, isLastMessage, isStreaming])

  // Track content changes to show/hide copy button during streaming
  React.useEffect(() => {
    if (!isUser) {
      // Initial render - check if message has content
      if (!hasInitialized.current) {
        hasInitialized.current = true
        lastContentRef.current = message.content

        // If message already has content, show actions
        if (message.content) {
          setShowActions(true)
        }
        return
      }

      // For last message, track content changes
      if (isLastMessage) {
        // Content changed, likely streaming
        if (message.content !== lastContentRef.current) {
          lastContentRef.current = message.content
          setShowActions(false)

          // Clear any existing timeout
          if (showActionsTimeoutRef.current) {
            clearTimeout(showActionsTimeoutRef.current)
          }

          // Show actions after no changes (matching cursor timing)
          showActionsTimeoutRef.current = setTimeout(() => {
            setShowActions(true)
          }, 500)
        }
      } else {
        // Not last message, always show actions if has content
        if (message.content && !showActions) {
          setShowActions(true)
        }
      }
    }

    return () => {
      if (showActionsTimeoutRef.current) {
        clearTimeout(showActionsTimeoutRef.current)
      }
    }
  }, [message.content, isUser, isLastMessage, showActions])

  const USER_MESSAGE_MAX_HEIGHT = 150
  const QUOTE_PREVIEW_MAX_LENGTH = 240
  const [isQuoteExpanded, setIsQuoteExpanded] = useState(false)
  const shouldTruncateQuote =
    !!message.quote && message.quote.length > QUOTE_PREVIEW_MAX_LENGTH
  const displayedQuote =
    message.quote && shouldTruncateQuote && !isQuoteExpanded
      ? `${message.quote.slice(0, QUOTE_PREVIEW_MAX_LENGTH).trimEnd()}…`
      : (message.quote ?? '')
  const hasInlineTextSegments =
    !isUser &&
    (message.segments?.some((segment) => segment.type === 'text') ?? false)

  React.useEffect(() => {
    if (isUser && userMessageContentRef.current) {
      setIsUserMessageOverflowing(
        userMessageContentRef.current.scrollHeight > USER_MESSAGE_MAX_HEIGHT,
      )
    }
  }, [isUser, message.content])

  const handleStartEdit = React.useCallback(() => {
    setEditContent(message.content || '')
    setIsEditing(true)
    setTimeout(() => {
      if (editTextareaRef.current) {
        editTextareaRef.current.focus()
        editTextareaRef.current.setSelectionRange(
          editTextareaRef.current.value.length,
          editTextareaRef.current.value.length,
        )
      }
    }, 0)
  }, [message.content])

  const handleCancelEdit = React.useCallback(() => {
    setIsEditing(false)
    setEditContent(message.content || '')
  }, [message.content])

  const handleSubmitEdit = React.useCallback(() => {
    if (editContent.trim() && onEditMessage) {
      onEditMessage(messageIndex, editContent.trim())
      setIsEditing(false)
    }
  }, [editContent, messageIndex, onEditMessage])

  const handleRegenerate = React.useCallback(() => {
    if (onRegenerateMessage) {
      onRegenerateMessage(messageIndex)
    }
  }, [messageIndex, onRegenerateMessage])

  const handleCopyUser = React.useCallback(() => {
    if (message.content) {
      navigator.clipboard.writeText(message.content)
      setCopiedUser(true)
      setTimeout(() => setCopiedUser(false), 2000)
    }
  }, [message.content])

  // Format the message date (short for display, full for tooltip)
  const { formattedDate, fullDate } = React.useMemo(() => {
    if (!message.timestamp) return { formattedDate: null, fullDate: null }
    const date =
      message.timestamp instanceof Date
        ? message.timestamp
        : new Date(message.timestamp)
    return {
      formattedDate: date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      fullDate: date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
    }
  }, [message.timestamp])

  return (
    <div
      className={`relative mx-auto flex w-full max-w-3xl flex-col ${isUser ? 'items-end' : 'items-start'} group mb-6`}
      data-message-role={message.role}
    >
      {/* Display the quoted reply preview above the user's message */}
      {isUser && message.quote && !isEditing && (
        <div className="flex w-full justify-end px-4 pb-1 pt-2">
          <div className="flex max-w-[95%] items-start gap-2 opacity-70">
            <ArrowUturnLeftIcon className="mt-1 h-3.5 w-3.5 flex-shrink-0 text-content-secondary" />
            <div className="min-w-0">
              <p
                className={cn(
                  'whitespace-pre-wrap text-sm italic text-content-secondary',
                  !isQuoteExpanded && 'line-clamp-3',
                )}
              >
                {displayedQuote}
              </p>
              {shouldTruncateQuote && (
                <button
                  type="button"
                  onClick={() => setIsQuoteExpanded((prev) => !prev)}
                  className="mt-0.5 text-xs font-medium text-content-secondary underline-offset-2 transition-colors hover:text-content-primary hover:underline"
                >
                  {isQuoteExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Display documents and images for user messages */}
      {isUser && hasMessageAttachments(message) && (
        <DocumentList
          attachments={message.attachments}
          documents={message.documents}
          documentContent={message.documentContent}
          imageData={message.imageData}
        />
      )}

      {/* Render inline segments (events interleaved in the order they
          streamed) when present; fall back to the legacy fixed layout for
          older messages without segments. Thoughts render once at the top
          since a message has at most one thoughts stream and it always
          precedes the content segments. */}
      {!isUser && message.segments && message.segments.length > 0 ? (
        <div className={EVENT_STACK_CLASSES}>
          {(message.isThinking ||
            (typeof message.thoughts === 'string' &&
              message.thoughts.trim().length > 0)) && (
            <div className="no-scroll-anchoring w-full px-4">
              <ThoughtProcess
                thoughts={message.thoughts || ''}
                isDarkMode={isDarkMode}
                isThinking={message.isThinking}
                thinkingDuration={message.thinkingDuration}
                messageId={messageUniqueId}
                expandedThoughtsState={expandedThoughtsState}
                setExpandedThoughtsState={setExpandedThoughtsState}
              />
            </div>
          )}
          {(() => {
            // Group adjacent same-kind event segments so long runs of
            // tool calls collapse into a single summary row instead of
            // stacking one full pill per event.
            type Run =
              | { kind: 'text'; index: number }
              | {
                  kind: 'web_search'
                  index: number
                  instances: NonNullable<typeof message.webSearches>
                }
              | {
                  kind: 'url_fetch'
                  index: number
                  fetches: NonNullable<typeof message.urlFetches>
                }
            const runs: Run[] = []
            message.segments.forEach((segment, i) => {
              if (segment.type === 'text') {
                runs.push({ kind: 'text', index: i })
                return
              }
              if (segment.type === 'web_search') {
                const instance = message.webSearches?.find(
                  (w) => w.id === segment.searchId,
                )
                if (!instance) return
                const last = runs[runs.length - 1]
                if (last && last.kind === 'web_search') {
                  last.instances.push(instance)
                } else {
                  runs.push({
                    kind: 'web_search',
                    index: i,
                    instances: [instance],
                  })
                }
                return
              }
              if (segment.type === 'url_fetch') {
                const fetchState = message.urlFetches?.find(
                  (f) => f.id === segment.fetchId,
                )
                if (!fetchState) return
                const last = runs[runs.length - 1]
                if (last && last.kind === 'url_fetch') {
                  last.fetches.push(fetchState)
                } else {
                  runs.push({
                    kind: 'url_fetch',
                    index: i,
                    fetches: [fetchState],
                  })
                }
              }
            })

            return runs.map((run, runIndex) => {
              if (run.kind === 'text') {
                const segment = message.segments?.[run.index]
                if (!segment || segment.type !== 'text' || !segment.text) {
                  return null
                }

                const textIsStreaming =
                  !!isStreaming &&
                  !!isLastMessage &&
                  runIndex === runs.length - 1 &&
                  !message.isThinking

                return (
                  <div
                    key={`run-${run.index}`}
                    className="no-scroll-anchoring w-full px-4"
                  >
                    <div
                      className={cn(
                        'prose w-full max-w-none text-base prose-pre:bg-transparent prose-pre:p-0',
                        'text-content-primary prose-headings:text-content-primary prose-strong:text-content-primary prose-code:text-content-primary',
                        'prose-a:text-blue-500 hover:prose-a:text-blue-600',
                        '[&>*:first-child_p:first-child]:mt-0 [&>p:first-child]:mt-0',
                        '[&>*:last-child_p:last-child]:mb-0 [&>p:last-child]:mb-0',
                      )}
                    >
                      {textIsStreaming ? (
                        <StreamingContentWrapper isStreaming={true}>
                          <StreamingChunkedText
                            content={segment.text}
                            isDarkMode={isDarkMode}
                            isUser={false}
                            isStreaming={true}
                            citationUrlTitles={citationUrlTitles}
                          />
                        </StreamingContentWrapper>
                      ) : (
                        <StreamingChunkedText
                          content={segment.text}
                          isDarkMode={isDarkMode}
                          isUser={false}
                          isStreaming={false}
                          citationUrlTitles={citationUrlTitles}
                        />
                      )}
                    </div>
                    {textIsStreaming && (
                      <div
                        role="status"
                        aria-label="Response still streaming"
                        className="mt-1 text-content-primary"
                      >
                        <StreamingTracer />
                      </div>
                    )}
                  </div>
                )
              }
              const isTrailingRun =
                !!isStreaming &&
                !!isLastMessage &&
                runIndex === runs.length - 1 &&
                !message.isThinking
              if (run.kind === 'web_search') {
                const aggregate = run.instances[run.instances.length - 1]
                return (
                  <div
                    key={`run-${run.index}`}
                    className="no-scroll-anchoring w-full px-4"
                  >
                    <WebSearchProcess
                      webSearch={aggregate}
                      groupInstances={
                        run.instances.length > 1 ? run.instances : undefined
                      }
                    />
                    {isTrailingRun && (
                      <div
                        role="status"
                        aria-label="Response still streaming"
                        className="mt-1 text-content-primary"
                      >
                        <StreamingTracer />
                      </div>
                    )}
                  </div>
                )
              }
              if (run.kind === 'url_fetch') {
                return (
                  <div
                    key={`run-${run.index}`}
                    className="no-scroll-anchoring w-full px-4"
                  >
                    <URLFetchProcess urlFetches={run.fetches} />
                    {isTrailingRun && (
                      <div
                        role="status"
                        aria-label="Response still streaming"
                        className="mt-1 text-content-primary"
                      >
                        <StreamingTracer />
                      </div>
                    )}
                  </div>
                )
              }
              return null
            })
          })()}
        </div>
      ) : (
        <div className={EVENT_STACK_CLASSES}>
          {/* Show URL fetch status for assistant messages */}
          {!isUser && message.urlFetches && message.urlFetches.length > 0 && (
            <div className="no-scroll-anchoring w-full px-4">
              <URLFetchProcess urlFetches={message.urlFetches} />
            </div>
          )}

          {/* Show web search for assistant messages - before thoughts if it started first */}
          {!isUser && message.webSearch && message.webSearchBeforeThinking && (
            <div className="no-scroll-anchoring w-full px-4">
              <WebSearchProcess webSearch={message.webSearch} />
            </div>
          )}

          {/* Show thoughts for assistant messages */}
          {!isUser &&
            (message.isThinking ||
              (typeof message.thoughts === 'string' &&
                message.thoughts.trim().length > 0)) && (
              <div className="no-scroll-anchoring w-full px-4">
                <ThoughtProcess
                  thoughts={message.thoughts || ''}
                  isDarkMode={isDarkMode}
                  isThinking={message.isThinking}
                  thinkingDuration={message.thinkingDuration}
                  messageId={messageUniqueId}
                  expandedThoughtsState={expandedThoughtsState}
                  setExpandedThoughtsState={setExpandedThoughtsState}
                />
              </div>
            )}

          {/* Show web search for assistant messages - after thoughts if it started after */}
          {!isUser && message.webSearch && !message.webSearchBeforeThinking && (
            <div className="no-scroll-anchoring w-full px-4">
              <WebSearchProcess webSearch={message.webSearch} />
            </div>
          )}
        </div>
      )}

      {/* Tool call rendered components */}
      {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
        <div className="w-full px-4 py-2">
          <GenUIToolCallRenderer
            toolCalls={message.toolCalls}
            isStreaming={!!(isStreaming && isLastMessage)}
            isDarkMode={isDarkMode}
          />
        </div>
      )}

      {/* Message content */}
      {message.content && (!hasInlineTextSegments || isUser) && (
        <>
          {/* Hide message when editing for user messages */}
          {!(isUser && isEditing) && (
            <div
              className={`w-full ${isUser ? 'flex justify-end px-4 pb-8 pt-2' : 'px-4 py-2'}`}
            >
              <div
                className={cn(
                  isUser ? 'max-w-[95%]' : 'w-full',
                  isUser &&
                    'rounded-2xl bg-surface-message-user/90 px-4 py-2 shadow-sm backdrop-blur-sm',
                  message.isRateLimitError &&
                    'rounded-lg border-2 border-brand-accent-dark/30 bg-brand-accent-dark/5 px-4 py-3',
                )}
              >
                {message.isRateLimitError && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <GoClockFill className="h-5 w-5 flex-shrink-0 text-brand-accent-dark dark:text-brand-accent-light" />
                      <span className="font-semibold text-brand-accent-dark dark:text-brand-accent-light">
                        Daily limit reached
                      </span>
                    </div>
                    <p className="text-sm text-brand-accent-dark/70 dark:text-brand-accent-light/70">
                      You&apos;ve used all your free requests for today.
                    </p>
                    <button
                      type="button"
                      className="w-fit rounded-md bg-brand-accent-dark px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-accent-dark/90"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('requestUpgrade'))
                      }}
                    >
                      Upgrade to Premium
                    </button>
                  </div>
                )}
                {!message.isRateLimitError && (
                  <>
                    <div className="relative">
                      <div
                        ref={isUser ? userMessageContentRef : undefined}
                        style={
                          isUser &&
                          isUserMessageOverflowing &&
                          !isUserMessageExpanded
                            ? {
                                maxHeight: USER_MESSAGE_MAX_HEIGHT,
                                overflow: 'hidden',
                              }
                            : undefined
                        }
                      >
                        <div
                          className={cn(
                            'prose w-full max-w-none text-base prose-pre:bg-transparent prose-pre:p-0',
                            'text-content-primary prose-headings:text-content-primary prose-strong:text-content-primary prose-code:text-content-primary',
                            'prose-a:text-blue-500 hover:prose-a:text-blue-600',
                          )}
                        >
                          {!isUser && isLastMessage ? (
                            <StreamingContentWrapper
                              isStreaming={isStreaming ?? false}
                            >
                              <StreamingChunkedText
                                content={message.content}
                                isDarkMode={isDarkMode}
                                isUser={isUser}
                                isStreaming={isStreaming}
                                citationUrlTitles={citationUrlTitles}
                              />
                            </StreamingContentWrapper>
                          ) : (
                            <StreamingChunkedText
                              content={message.content}
                              isDarkMode={isDarkMode}
                              isUser={isUser}
                              isStreaming={isStreaming}
                              citationUrlTitles={citationUrlTitles}
                            />
                          )}
                        </div>
                        {!isUser &&
                          isLastMessage &&
                          isStreaming &&
                          !message.isThinking && (
                            <div
                              role="status"
                              aria-label="Response still streaming"
                              className="mt-1 text-content-primary"
                            >
                              <StreamingTracer />
                            </div>
                          )}
                      </div>

                      {isUser &&
                        isUserMessageOverflowing &&
                        !isUserMessageExpanded && (
                          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-surface-message-user/90 to-transparent" />
                        )}
                    </div>

                    {isUser && isUserMessageOverflowing && (
                      <button
                        onClick={() =>
                          setIsUserMessageExpanded(!isUserMessageExpanded)
                        }
                        className="mt-1 flex w-full items-center justify-center gap-1 py-1 text-xs font-medium text-content-secondary transition-colors hover:text-content-primary"
                      >
                        <span>
                          {isUserMessageExpanded ? 'Show less' : 'Show more'}
                        </span>
                        <ChevronDownIcon
                          className={cn(
                            'h-3 w-3 transition-transform',
                            isUserMessageExpanded && 'rotate-180',
                          )}
                        />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Full-width edit mode for user messages */}
          {isUser && isEditing && (
            <div className="w-full px-4">
              <div className="rounded-xl border border-border-subtle bg-surface-chat p-4">
                <textarea
                  ref={editTextareaRef}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSubmitEdit()
                    } else if (e.key === 'Escape') {
                      handleCancelEdit()
                    }
                  }}
                  className={cn(
                    'w-full resize-none bg-transparent text-base leading-relaxed text-content-primary placeholder:text-content-muted focus:outline-none',
                    CHAT_FONT_CLASSES[chatFont],
                  )}
                  rows={Math.min(
                    10,
                    Math.max(3, editContent.split('\n').length),
                  )}
                />
                <div className="mt-3 flex items-center justify-between">
                  <div className="hidden items-center gap-2 text-sm text-content-muted sm:flex">
                    <InformationCircleIcon className="h-4 w-4 shrink-0" />
                    <span>All messages after this point will be removed</span>
                  </div>
                  <div className="flex flex-1 justify-end gap-2">
                    <button
                      onClick={handleCancelEdit}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-chat-background"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSubmitEdit}
                      disabled={!editContent.trim()}
                      className="rounded-lg bg-surface-chat-background px-4 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-chat-background/80 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action bar for user messages */}
          {isUser && !isEditing && (
            <div className="flex h-0 items-center justify-end gap-1 overflow-visible px-4">
              {formattedDate && (
                <div className="group/date relative">
                  <span className="px-2 py-1 text-sm text-content-muted">
                    {formattedDate}
                  </span>
                  {fullDate && (
                    <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-border-subtle bg-surface-chat-background px-2 py-1 text-xs text-content-primary opacity-0 shadow-sm transition-opacity group-hover/date:opacity-100">
                      {fullDate}
                    </span>
                  )}
                </div>
              )}
              {onRegenerateMessage && (
                <div className="group/regen relative">
                  <button
                    onClick={handleRegenerate}
                    className="rounded-lg p-2 text-content-secondary transition-colors hover:bg-surface-chat-background hover:text-content-primary"
                  >
                    <ArrowPathIcon className="h-4 w-4" />
                  </button>
                  <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-border-subtle bg-surface-chat-background px-2 py-1 text-xs text-content-primary opacity-0 shadow-sm transition-opacity group-hover/regen:opacity-100">
                    Regenerate
                  </span>
                </div>
              )}
              {onEditMessage && (
                <div className="group/edit relative">
                  <button
                    onClick={handleStartEdit}
                    className="rounded-lg p-2 text-content-secondary transition-colors hover:bg-surface-chat-background hover:text-content-primary"
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                  </button>
                  <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-border-subtle bg-surface-chat-background px-2 py-1 text-xs text-content-primary opacity-0 shadow-sm transition-opacity group-hover/edit:opacity-100">
                    Edit
                  </span>
                </div>
              )}
              <div className="group/copy relative">
                <button
                  onClick={handleCopyUser}
                  className={`flex items-center gap-1.5 rounded-lg p-2 text-xs font-medium transition-all ${
                    copiedUser
                      ? 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400'
                      : 'text-content-secondary hover:bg-surface-chat-background hover:text-content-primary'
                  }`}
                >
                  {copiedUser ? (
                    <>
                      <BsCheckLg className="h-4 w-4" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <RxCopy className="h-4 w-4" />
                  )}
                </button>
                {!copiedUser && (
                  <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-border-subtle bg-surface-chat-background px-2 py-1 text-xs text-content-primary opacity-0 shadow-sm transition-opacity group-hover/copy:opacity-100">
                    Copy
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Actions for assistant messages - hidden while streaming the last response */}
      {!isUser && message.content && !(isStreaming && isLastMessage) && (
        <div
          className={`mt-4 flex items-center justify-between gap-3 px-4 transition-opacity duration-500 ease-in-out ${
            showActions ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div className="flex items-center gap-1">
            {message.webSearch?.sources &&
              message.webSearch.sources.length > 0 &&
              !(isStreaming && isLastMessage) && (
                <SourcesButton sources={message.webSearch.sources} />
              )}
            <MessageActions content={message.content} isDarkMode={isDarkMode} />
            {/* Regenerate button - only on last assistant message */}
            {isLastMessage && onRegenerateMessage && messageIndex > 0 && (
              <div className="group/regen relative">
                <button
                  onClick={() => onRegenerateMessage(messageIndex - 1)}
                  className="flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium text-content-secondary transition-all hover:bg-surface-chat-background hover:text-content-primary"
                >
                  <ArrowPathIcon className="h-3.5 w-3.5" />
                </button>
                <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-border-subtle bg-surface-chat-background px-2 py-1 text-xs text-content-primary opacity-0 shadow-sm transition-opacity group-hover/regen:opacity-100">
                  Regenerate
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const DefaultMessage = memo(DefaultMessageComponent)

export const DefaultMessageRenderer: MessageRenderer = {
  id: 'default',
  canRender: () => true,
  render: DefaultMessage as (props: MessageRenderProps) => JSX.Element,
}
