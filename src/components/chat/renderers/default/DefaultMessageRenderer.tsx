import { GenUIToolCallRenderer } from '@/components/chat/genui/GenUIToolCallRenderer'
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
import { StreamingChunkedText } from '../components/StreamingChunkedText'
import { StreamingContentWrapper } from '../components/StreamingContentWrapper'
import { StreamingSilenceIndicator } from '../components/StreamingSilenceIndicator'
import { ThoughtProcess } from '../components/ThoughtProcess'
import { URLFetchProcess } from '../components/URLFetchProcess'
import { WebSearchProcess } from '../components/WebSearchProcess'
import type { MessageRenderer, MessageRenderProps } from '../types'

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
  const thoughtSources = React.useMemo(
    () =>
      message.webSearch?.sources ??
      message.annotations?.map((a) => ({
        title: a.url_citation.title,
        url: a.url_citation.url,
      })),
    [message.webSearch?.sources, message.annotations],
  )
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
              sources={thoughtSources}
            />
          </div>
        )}

      {/* Show web search for assistant messages - after thoughts if it started after */}
      {!isUser && message.webSearch && !message.webSearchBeforeThinking && (
        <div className="no-scroll-anchoring w-full px-4">
          <WebSearchProcess webSearch={message.webSearch} />
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
      {message.content && (
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
                  message.isError &&
                    !message.isRateLimitError &&
                    'rounded-lg border-2 border-red-500/30 bg-red-500/5 px-4 py-3',
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
                {message.isError && !message.isRateLimitError && (
                  <div className="mb-3 flex items-center gap-2 border-b border-red-500/20 pb-2">
                    <svg
                      className="h-5 w-5 flex-shrink-0 text-red-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <span className="font-semibold text-red-500">
                      Error occurred
                    </span>
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
                          {!isUser && isStreaming && isLastMessage ? (
                            <StreamingContentWrapper isStreaming={true}>
                              <StreamingChunkedText
                                content={message.content}
                                isDarkMode={isDarkMode}
                                isUser={isUser}
                                isStreaming={isStreaming}
                              />
                            </StreamingContentWrapper>
                          ) : (
                            <StreamingChunkedText
                              content={message.content}
                              isDarkMode={isDarkMode}
                              isUser={isUser}
                              isStreaming={isStreaming}
                            />
                          )}
                        </div>
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

          {/* Actions for assistant messages - fade in/out during streaming */}
          {!isUser && (
            <div
              className={`flex items-center gap-1 px-4 transition-opacity duration-500 ease-in-out ${
                showActions ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
            >
              <MessageActions
                content={message.content}
                isDarkMode={isDarkMode}
              />
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
          )}
        </>
      )}

      {/* Bridge indicator — shown while the assistant is still streaming but
          no other animated element (thinking, web search, tool-call cards)
          is visible. Covers the silence between narration text and the first
          finalized tool call. */}
      {!isUser && isStreaming && isLastMessage && (
        <StreamingSilenceIndicator
          isThinking={!!message.isThinking}
          hasActiveWebSearch={message.webSearch?.status === 'searching'}
          hasActiveToolCalls={
            !!message.toolCalls && message.toolCalls.length > 0
          }
        />
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
