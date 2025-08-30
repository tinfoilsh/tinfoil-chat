'use client'

import React from 'react'
import { DocumentList } from '../components/DocumentList'
import { MessageActions } from '../components/MessageActions'
import { StreamingText } from '../components/StreamingText'
import { ThoughtProcess } from '../components/ThoughtProcess'
import type { MessageRenderer, MessageRenderProps } from '../types'

const DefaultMessage = ({
  message,
  isDarkMode,
  isLastMessage,
  isStreaming,
  expandedThoughtsState,
  setExpandedThoughtsState,
}: MessageRenderProps) => {
  const isUser = message.role === 'user'
  const [showActions, setShowActions] = React.useState(false)
  const lastContentRef = React.useRef(message.content)
  const showActionsTimeoutRef = React.useRef<NodeJS.Timeout>()
  const hasInitialized = React.useRef(false)

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
      {!isUser && message.thoughts && (
        <div className="mb-2 w-full">
          <ThoughtProcess
            thoughts={message.thoughts}
            isDarkMode={isDarkMode}
            isThinking={message.isThinking}
            thinkingDuration={message.thinkingDuration}
            messageId={`${message.timestamp}-${message.role}`}
            expandedThoughtsState={expandedThoughtsState}
            setExpandedThoughtsState={setExpandedThoughtsState}
          />
        </div>
      )}

      {/* Message content */}
      {message.content && (
        <>
          <div
            className={`w-full py-2 ${isUser ? 'flex justify-end px-4' : 'px-4'}`}
          >
            <div
              className={`${isUser ? 'max-w-[95%]' : 'w-full'} ${
                isUser
                  ? `${isDarkMode ? 'bg-gray-700/75 backdrop-blur-sm' : 'bg-gray-100'} rounded-lg px-4 py-2`
                  : ''
              } overflow-x-auto`}
            >
              <div
                className={`prose w-full max-w-none text-base ${
                  isDarkMode
                    ? 'prose-invert text-gray-100 prose-headings:text-gray-100 prose-a:text-gray-500 hover:prose-a:text-gray-400 prose-strong:text-gray-100 prose-code:text-gray-100 prose-pre:bg-transparent prose-pre:p-0'
                    : isUser
                      ? 'text-gray-900 prose-headings:text-gray-900 prose-a:text-gray-600 hover:prose-a:text-gray-700 prose-strong:text-gray-900 prose-code:text-gray-800 prose-pre:bg-transparent prose-pre:p-0'
                      : 'text-gray-900 prose-a:text-gray-500 hover:prose-a:text-gray-400 prose-code:text-gray-800 prose-pre:bg-transparent prose-pre:p-0'
                }`}
              >
                <StreamingText
                  content={message.content}
                  isDarkMode={isDarkMode}
                  isUser={isUser}
                />
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

export const DefaultMessageRenderer: MessageRenderer = {
  id: 'default',
  modelPattern: /.*/,
  canRender: () => true,
  render: DefaultMessage,
}
