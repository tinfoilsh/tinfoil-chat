'use client'

import { cn } from '@/components/ui/utils'
import React, { memo } from 'react'
import { DocumentList } from '../components/DocumentList'
import { MessageActions } from '../components/MessageActions'
import { StreamingChunkedText } from '../components/StreamingChunkedText'
import { StreamingContentWrapper } from '../components/StreamingContentWrapper'
import { ThoughtProcess } from '../components/ThoughtProcess'
import type { MessageRenderer, MessageRenderProps } from '../types'

const DefaultMessageComponent = ({
  message,
  isDarkMode,
  isLastMessage,
  isStreaming,
  expandedThoughtsState,
  setExpandedThoughtsState,
}: MessageRenderProps) => {
  const isUser = message.role === 'user'

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
                />
              </StreamingContentWrapper>
            </div>
          </div>
        )}

      {/* Message content */}
      {message.content && (
        <>
          <div
            className={`w-full py-2 ${isUser ? 'flex justify-end px-4' : 'px-4'}`}
          >
            <div
              className={cn(
                isUser ? 'max-w-[95%]' : 'w-full',
                isUser &&
                  'rounded-lg bg-surface-message-user/90 px-4 py-2 shadow-sm backdrop-blur-sm',
              )}
            >
              <div
                className={cn(
                  'prose w-full max-w-none overflow-x-auto text-base prose-pre:bg-transparent prose-pre:p-0',
                  'text-content-primary prose-headings:text-content-primary prose-strong:text-content-primary prose-code:text-content-primary',
                  'prose-a:text-accent hover:prose-a:text-accent/80',
                  'dark:prose-invert',
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

          {/* Copy button for assistant messages - fade in/out during streaming */}
          {!isUser && (
            <div
              className={`transition-opacity duration-500 ease-in-out ${
                showActions ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
            >
              <MessageActions
                content={message.content}
                isDarkMode={isDarkMode}
              />
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
