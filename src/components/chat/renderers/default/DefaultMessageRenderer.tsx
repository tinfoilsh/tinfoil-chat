import { cn } from '@/components/ui/utils'
import {
  ArrowPathIcon,
  InformationCircleIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline'
import { TfCopy } from '@tinfoilsh/tinfoil-icons'
import React, { memo } from 'react'
import { BsCheckLg } from 'react-icons/bs'
import { DocumentList } from '../components/DocumentList'
import { MessageActions } from '../components/MessageActions'
import { StreamingChunkedText } from '../components/StreamingChunkedText'
import { StreamingContentWrapper } from '../components/StreamingContentWrapper'
import { ThoughtProcess } from '../components/ThoughtProcess'
import type { MessageRenderer, MessageRenderProps } from '../types'

const DefaultMessageComponent = ({
  message,
  messageIndex,
  isDarkMode,
  isLastMessage,
  isStreaming,
  expandedThoughtsState,
  setExpandedThoughtsState,
  titleModelName,
  onEditMessage,
  onRegenerateMessage,
}: MessageRenderProps) => {
  const isUser = message.role === 'user'
  const [isEditing, setIsEditing] = React.useState(false)
  const [editContent, setEditContent] = React.useState(message.content || '')
  const [copiedUser, setCopiedUser] = React.useState(false)
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
      className={`flex flex-col ${isUser ? 'items-end' : 'w-full items-start'} group mb-6`}
    >
      {/* Display documents for user messages */}
      {isUser && message.documents && message.documents.length > 0 && (
        <DocumentList
          documents={message.documents}
          imageData={message.imageData}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Show thoughts for assistant messages */}
      {!isUser &&
        (message.isThinking ||
          (typeof message.thoughts === 'string' &&
            message.thoughts.trim().length > 0)) && (
          <div className="no-scroll-anchoring w-full px-4 py-2">
            <div className="mb-2 w-full">
              <StreamingContentWrapper
                isStreaming={Boolean(
                  hasShownThoughts.current &&
                    isLastMessage &&
                    (isStreaming || message.isThinking),
                )}
              >
                <ThoughtProcess
                  thoughts={message.thoughts || ''}
                  isDarkMode={isDarkMode}
                  isThinking={message.isThinking}
                  thinkingDuration={message.thinkingDuration}
                  messageId={messageUniqueId}
                  expandedThoughtsState={expandedThoughtsState}
                  setExpandedThoughtsState={setExpandedThoughtsState}
                  titleModelName={titleModelName}
                />
              </StreamingContentWrapper>
            </div>
          </div>
        )}

      {/* Message content */}
      {message.content && (
        <>
          {/* Hide message when editing for user messages */}
          {!(isUser && isEditing) && (
            <div
              className={`w-full py-2 ${isUser ? 'flex justify-end px-4' : 'px-4'}`}
            >
              <div
                className={cn(
                  isUser ? 'max-w-[95%]' : 'w-full',
                  isUser &&
                    'rounded-lg bg-surface-message-user/90 px-4 py-2 shadow-sm backdrop-blur-sm',
                  message.isError &&
                    'rounded-lg border-2 border-red-500/30 bg-red-500/5 px-4 py-3',
                )}
              >
                {message.isError && (
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

                <div
                  className={cn(
                    'prose w-full max-w-none overflow-x-auto text-lg prose-pre:bg-transparent prose-pre:p-0',
                    'text-content-primary prose-headings:text-content-primary prose-strong:text-content-primary prose-code:text-content-primary',
                    'prose-a:text-accent hover:prose-a:text-accent/80',
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
                  className="w-full resize-none bg-transparent text-lg leading-relaxed text-content-primary placeholder:text-content-muted focus:outline-none"
                  rows={Math.min(
                    10,
                    Math.max(3, editContent.split('\n').length),
                  )}
                />
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-content-muted">
                    <InformationCircleIcon className="h-4 w-4" />
                    <span>All messages after this point will be removed</span>
                  </div>
                  <div className="flex gap-2">
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
            <div className="flex items-center justify-end gap-1 px-4 pt-1 opacity-0 transition-opacity group-hover:opacity-100">
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
                    <TfCopy className="h-4 w-4" />
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
    </div>
  )
}

const DefaultMessage = memo(DefaultMessageComponent)

export const DefaultMessageRenderer: MessageRenderer = {
  id: 'default',
  canRender: () => true,
  render: DefaultMessage as (props: MessageRenderProps) => JSX.Element,
}
