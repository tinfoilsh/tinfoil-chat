'use client'

import { DocumentList } from '../components/DocumentList'
import { MessageActions } from '../components/MessageActions'
import { MessageContent } from '../components/MessageContent'
import { ThoughtProcess } from '../components/ThoughtProcess'
import type { MessageRenderer, MessageRenderProps } from '../types'

export const DefaultMessageRenderer: MessageRenderer = {
  id: 'default',
  modelPattern: /.*/,
  canRender: () => true,

  render: ({
    message,
    isDarkMode,
    isLastMessage,
    isStreaming,
    expandedThoughtsState,
    setExpandedThoughtsState,
  }: MessageRenderProps) => {
    const isUser = message.role === 'user'

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
                  <MessageContent
                    content={message.content}
                    isDarkMode={isDarkMode}
                    isUser={isUser}
                  />
                </div>
              </div>
            </div>

            {/* Copy button for assistant messages */}
            {!isUser && !(isLastMessage && isStreaming) && (
              <MessageActions
                content={message.content}
                isDarkMode={isDarkMode}
              />
            )}
          </>
        )}
      </div>
    )
  },
}
