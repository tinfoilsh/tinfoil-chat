'use client'

import { CHAT_CONFIG } from '@/app/config/models'
import { CONSTANTS } from './constants'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { LuBrain } from 'react-icons/lu'
import ReactMarkdown from 'react-markdown'
import { CodeBlock } from '../code-block'
import { LoadingDots } from '../loading-dots'
import type { Message } from './types'
import { 
  FaFile, 
  FaFileImage, 
  FaFilePdf, 
  FaFileWord, 
  FaFileExcel,
  FaFileCode,
  FaFileAudio,
  FaFileVideo,
  FaFileArchive,
  FaFilePowerpoint,
  FaFileAlt
} from 'react-icons/fa';
import { getFileIconType } from './document-uploader';

// Add new types
type MessageWithThoughts = Message & {
  thoughts?: string
  isThinking?: boolean
}

type ChatMessagesProps = {
  messages: Message[]
  isThinking: boolean
  isDarkMode: boolean
  chatId: string
  messagesEndRef: React.RefObject<HTMLDivElement>
  openAndExpandVerifier: () => void
  isInitialLoad: boolean
  setIsInitialLoad: (value: boolean) => void
  isWaitingForResponse?: boolean
}

// Add new component for thought process display
const ThoughtProcess = memo(function ThoughtProcess({
  thoughts,
  isDarkMode,
  isThinking = false,
  shouldDiscard = false,
  isCompleted = false,
}: {
  thoughts: string
  isDarkMode: boolean
  isThinking?: boolean
  shouldDiscard?: boolean
  isCompleted?: boolean
}) {
  // Start expanded if thinking or if thoughts are completed
  const [isExpanded, setIsExpanded] = useState(isThinking || isCompleted)

  // Update isExpanded when isThinking changes
  useEffect(() => {
    setIsExpanded(isThinking || isCompleted)
  }, [isThinking, isCompleted])

  // Process the markdown to extract all paragraphs - moved before any conditional returns
  const paragraphs = useMemo(
    () =>
      thoughts
        .split('\n\n')
        .filter((p) => p.trim() !== '')
        .map((p) => p.trim()),
    [thoughts],
  )

  // Don't render if thoughts are empty and not actively thinking
  // Also don't render if there are no thoughts
  if (
    shouldDiscard ||
    (!thoughts.trim() && !isThinking) ||
    thoughts.trim() === ''
  ) {
    return null
  }

  return (
    <div
      className={`mx-4 mb-4 mt-2 rounded-lg ${
        isDarkMode ? 'bg-gray-700/50' : 'bg-gray-100'
      }`}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex w-full items-center justify-between px-3.5 py-2 text-left ${
          isDarkMode
            ? 'text-gray-200 hover:bg-gray-600/50'
            : 'text-gray-700 hover:bg-gray-200'
        } rounded-lg transition-colors`}
      >
        <div className="flex items-center gap-2">
          <LuBrain className="h-5 w-5 opacity-70" />
          <span className="text-sm font-medium">
            {isThinking
              ? 'Thinking'
              : isCompleted
                ? 'Thoughts'
                : 'Thought Process'}
          </span>
          {isThinking && (
            <LoadingDots isThinking={true} isDarkMode={isDarkMode} />
          )}
        </div>
        <svg
          className={`h-5 w-5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      <motion.div
        initial={false}
        animate={{
          height: isExpanded ? 'auto' : 0,
          opacity: isExpanded ? 1 : 0,
        }}
        transition={{
          duration: 0.2,
          ease: 'easeInOut',
        }}
        style={{ overflow: 'hidden' }}
      >
        <div
          className={`px-4 py-2 text-sm ${
            isDarkMode ? 'text-gray-300' : 'text-gray-600'
          }`}
        >
          <div className="w-full">
            {paragraphs.map((paragraph, i) => (
              <div key={i} className="relative mb-5">
                {/* Connecting line between steps */}
                {i < paragraphs.length - 1 && (
                  <div
                    className={`absolute bottom-[-20px] left-[7px] top-4 w-[1px] ${
                      isDarkMode ? 'bg-gray-500' : 'bg-gray-300'
                    }`}
                  ></div>
                )}
                <div className="flex items-start">
                  <div className="relative z-10 mr-2 flex-shrink-0">
                    <div className="flex items-center justify-center">
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          isDarkMode
                            ? 'border-gray-500 text-gray-300'
                            : 'border-gray-400 text-gray-600'
                        } z-10 text-[10px] font-medium ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}
                        style={{ userSelect: 'none' }}
                      >
                        {i + 1}
                      </span>
                    </div>
                  </div>
                  <div className="min-h-[24px] flex-1 pb-2">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <>{children}</>,
                      }}
                    >
                      {paragraph}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  )
})

// Create a memoized markdown renderer to prevent unnecessary re-renders
const MemoizedMarkdown = memo(function MemoizedMarkdown({
  content,
  isDarkMode,
}: {
  content: string
  isDarkMode: boolean
}) {
  return (
    <ReactMarkdown
      components={{
        code({
          node,
          className,
          children,
          ...props
        }: {
          node?: any
          className?: string
          children?: React.ReactNode
          inline?: boolean
        } & React.HTMLAttributes<HTMLElement>) {
          const match = /language-(\w+)/.exec(className || '')
          const language = match ? match[1] : ''

          if (!props.inline && language) {
            return (
              <CodeBlock
                code={String(children).replace(/\n$/, '')}
                language={language}
                isDarkMode={isDarkMode}
              />
            )
          }
          return (
            <code className={className} {...props}>
              {children}
            </code>
          )
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
})

// Memoize the ChatMessage component to prevent re-renders
const ChatMessage = memo(function ChatMessage({
  message,
  isDarkMode,
  shouldDiscardThoughts = false,
  isLastMessage = false,
  isWaitingForResponse = false,
}: {
  message: MessageWithThoughts
  isDarkMode: boolean
  shouldDiscardThoughts?: boolean
  isLastMessage?: boolean
  isWaitingForResponse?: boolean
}) {
  const isUser = message.role === 'user'

  // Check if this is a completed thought-only message
  const isCompletedThought = Boolean(
    !message.content && message.thoughts && !message.isThinking,
  )

  // Only show thoughts if we have actual thoughts content or are actively thinking
  const shouldShowThoughts =
    !shouldDiscardThoughts &&
    (message.thoughts?.trim() !== '' || message.isThinking)

  const getFileIcon = (filename: string) => {
    const type = getFileIconType(filename);
    const iconProps = { className: `h-5 w-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}` };
    switch (type) {
      case 'pdf': return <FaFilePdf {...iconProps} />;
      case 'docx': return <FaFileWord {...iconProps} />;
      case 'pptx': return <FaFilePowerpoint {...iconProps} />;
      case 'xlsx':
      case 'csv': return <FaFileExcel {...iconProps} />;
      case 'image': return <FaFileImage {...iconProps} />;
      case 'audio': return <FaFileAudio {...iconProps} />;
      case 'video': return <FaFileVideo {...iconProps} />;
      case 'zip': return <FaFileArchive {...iconProps} />;
      case 'html': 
      case 'js': 
      case 'ts': 
      case 'css': 
      case 'md': return <FaFileCode {...iconProps} />;
      case 'txt': return <FaFileAlt {...iconProps} />;
      default: return <FaFile {...iconProps} />;
    }
  };

  return (
    <div
      className={`flex flex-col ${isUser ? 'items-end' : 'w-full items-start'} group mb-6`}
    >
      {/* Always show the "Tin" header for assistant messages, regardless of content */}
      {!isUser && (
        <div className="mb-1 ml-4 flex items-center gap-2">
          <div className="rounded-sm bg-black p-1 transition-colors">
            <Image
              src="/icon-dark.png"
              alt="Assistant icon"
              width={8}
              height={8}
              className="text-gray-300"
            />
          </div>
          <span
            className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}
          >
            Tin
          </span>
        </div>
      )}
      {/* Display document icons for user messages */}
      {isUser && message.documents && message.documents.length > 0 && (
        <div className="mb-2 flex flex-wrap justify-end gap-2 px-4">
          {message.documents.map((doc, index) => (
            <div 
              key={index} 
              className={`
                flex items-center rounded-lg 
                ${isDarkMode 
                  ? 'bg-gray-700/50 hover:bg-gray-700/70' 
                  : 'bg-gray-100 hover:bg-gray-200'} 
                px-3 py-1.5 transition-colors duration-200
              `}
            >
              <div className="mr-2">{getFileIcon(doc.name)}</div>
              <span className={`text-sm truncate max-w-[150px] ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                {doc.name}
              </span>
            </div>
          ))}
        </div>
      )}
      {/* Only show thoughts component if we have thoughts or are thinking */}
      {!isUser && shouldShowThoughts && (
        <div className="mb-2 w-full">
          <ThoughtProcess
            thoughts={message.thoughts ?? ''}
            isDarkMode={isDarkMode}
            isThinking={message.isThinking}
            shouldDiscard={shouldDiscardThoughts}
            isCompleted={isCompletedThought}
          />
        </div>
      )}
      {/* Only show content if it exists and is not just document content */}
      {message.content && (
        <div className={`w-full px-4 py-2 ${isUser ? 'flex justify-end' : ''}`}>
          <div
            className={`${isUser ? 'max-w-[95%]' : 'w-full'} ${
              isUser
                ? `${isDarkMode ? 'bg-gray-700/75 backdrop-blur-sm' : 'bg-gray-500'} rounded-2xl rounded-tr-sm px-4 py-2`
                : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <div
                className={`prose w-full max-w-none text-sm ${
                  isDarkMode
                    ? 'text-gray-100 prose-headings:text-gray-100 prose-a:text-gray-500 hover:prose-a:text-gray-400 prose-strong:text-gray-100 prose-code:text-gray-100 prose-pre:bg-transparent prose-pre:p-0'
                    : isUser
                      ? 'text-white prose-headings:text-white prose-a:text-gray-200 hover:prose-a:text-gray-100 prose-strong:text-white prose-code:text-white prose-pre:bg-transparent prose-pre:p-0'
                      : 'text-gray-900 prose-a:text-gray-500 hover:prose-a:text-gray-400 prose-pre:bg-transparent prose-pre:p-0'
                }`}
              >
                <MemoizedMarkdown
                  content={message.content}
                  isDarkMode={isDarkMode}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

// Add a new component for the loading state
const LoadingMessage = memo(function LoadingMessage({
  isDarkMode,
}: {
  isDarkMode: boolean
}) {
  return (
    <div className="group mb-6 flex w-full flex-col items-start">
      <div className="mb-1 ml-4 flex items-center gap-2">
        <div className="rounded-sm bg-black p-1 transition-colors">
          <Image
            src="/icon-dark.png"
            alt="Assistant icon"
            width={8}
            height={8}
            className="text-gray-300"
          />
        </div>
        <span
          className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}
        >
          Tin
        </span>
      </div>
      <div className="px-4 py-2">
        <LoadingDots isThinking={false} isDarkMode={isDarkMode} />
      </div>
    </div>
  )
})

export const scrollToBottom = (
  messagesEndRef: React.RefObject<HTMLDivElement>,
  behavior: ScrollBehavior = 'smooth',
) => {
  messagesEndRef.current?.scrollIntoView({ behavior })
}

// Welcome screen component to reduce renders
const WelcomeScreen = memo(function WelcomeScreen({
  isDarkMode,
  openAndExpandVerifier,
}: {
  isDarkMode: boolean
  openAndExpandVerifier: () => void
}) {
  return (
    <div className="text-center">
      <h1
        className={`font-display text-3xl font-medium tracking-tight ${
          isDarkMode ? 'text-gray-100' : 'text-gray-800'
        } mx-auto mb-10 max-w-lg text-left`}
      >
        Private Chat with Tin
      </h1>

      <ul className="mx-auto max-w-lg space-y-6 text-left">
        <li
          className={`flex items-start gap-3 ${
            isDarkMode ? 'text-gray-100' : 'text-gray-900'
          } text-lg`}
        >
          <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center mt-1">
            <svg
              className={`h-5 w-5 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5c-5 0-9.27 3.11-10.5 7.5 1.23 4.39 5.5 7.5 10.5 7.5s9.27-3.11 10.5-7.5c-1.23-4.39-5.5-7.5-10.5-7.5z" />
              <circle cx="12" cy="12" r="3" strokeWidth={2} />
              <line x1="3" y1="3" x2="21" y2="21" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </div>
          <div>
            Your conversations are completely private.
          </div>
        </li>
        <li
          className={`flex items-start gap-3 ${
            isDarkMode ? 'text-gray-100' : 'text-gray-900'
          } text-lg`}
        >
          <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center mt-1">
            <svg
              className={`h-5 w-5 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="12" cy="12" r="9" strokeWidth={2} />
              <line x1="6.75" y1="6.75" x2="17.25" y2="17.25" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </div>
          <div>
            Nobody can see your messages, not even Tinfoil.
          </div>
        </li>
        <li
          className={`flex items-start gap-3 ${
            isDarkMode ? 'text-gray-100' : 'text-gray-900'
          } text-lg`}
        >
          <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center mt-1">
            <svg
              className={`h-5 w-5 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <div>
            Confidentiality is enforced by the{' '}
            <button
              onClick={openAndExpandVerifier}
              className="inline text-emerald-500 hover:underline"
            >
              in-browser verifier.
            </button>
          </div>
        </li>
      </ul>
    </div>
  )
})

// Separator component
const MessagesSeparator = memo(function MessagesSeparator({
  isDarkMode,
}: {
  isDarkMode: boolean
}) {
  return (
    <div className={`relative my-6 flex items-center justify-center`}>
      <div
        className={`absolute w-full border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-300'}`}
      ></div>
      <span
        className={`relative px-4 ${isDarkMode ? 'bg-gray-800 text-gray-400' : 'bg-white text-gray-500'} text-sm font-medium`}
      >
        Archived Messages
      </span>
    </div>
  )
})

export function ChatMessages({
  messages,
  isThinking,
  isDarkMode,
  chatId,
  messagesEndRef,
  openAndExpandVerifier,
  isInitialLoad,
  setIsInitialLoad,
  isWaitingForResponse = false,
}: ChatMessagesProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const [mounted, setMounted] = useState(false)
  const userScrollingRef = useRef(false)
  const lastScrollPositionRef = useRef(0)

  // Check if there's already a thinking message in the chat
  const hasThinkingMessage = messages.some(
    (msg) => (msg as MessageWithThoughts).isThinking,
  )

  // Separate messages into archived and live sections - memoize this calculation
  const { archivedMessages, liveMessages } = useMemo(() => {
    const archived =
      messages.length > CHAT_CONFIG.MAX_PROMPT_MESSAGES
        ? messages.slice(0, -CHAT_CONFIG.MAX_PROMPT_MESSAGES)
        : []
    const live =
      messages.length > CHAT_CONFIG.MAX_PROMPT_MESSAGES
        ? messages.slice(-CHAT_CONFIG.MAX_PROMPT_MESSAGES)
        : messages
    return { archivedMessages: archived, liveMessages: live }
  }, [messages])

  useEffect(() => {
    setMounted(true)

    const container = scrollContainerRef.current
    if (container) {
      const handleScrollWrapper = () => {
        const { scrollTop, scrollHeight, clientHeight } = container
        const distanceFromBottom = scrollHeight - (scrollTop + clientHeight)

        // Store current scroll position for comparison
        lastScrollPositionRef.current = scrollTop

        // Only enable auto-scroll if user has scrolled very close to bottom
        // This is the key part - we only re-enable auto-scroll when user goes back to bottom
        setShouldAutoScroll(distanceFromBottom < 20)
      }

      const handleWheel = () => {
        // When user actively scrolls, immediately disable auto-scrolling
        if (shouldAutoScroll) {
          setShouldAutoScroll(false)
        }
        userScrollingRef.current = true
        // Reset after a short delay
        setTimeout(() => {
          userScrollingRef.current = false
        }, 150)
      }

      const handleTouchStart = () => {
        // Also handle touch events for mobile
        if (shouldAutoScroll) {
          setShouldAutoScroll(false)
        }
        userScrollingRef.current = true
      }

      const handleTouchEnd = () => {
        setTimeout(() => {
          userScrollingRef.current = false

          // Check if user scrolled to bottom after touch
          const { scrollTop, scrollHeight, clientHeight } = container
          const distanceFromBottom = scrollHeight - (scrollTop + clientHeight)
          if (distanceFromBottom < 20) {
            setShouldAutoScroll(true)
          }
        }, 150)
      }

      container.addEventListener('scroll', handleScrollWrapper, {
        passive: true,
      })
      container.addEventListener('wheel', handleWheel, { passive: true })
      container.addEventListener('touchstart', handleTouchStart, {
        passive: true,
      })
      container.addEventListener('touchend', handleTouchEnd, { passive: true })

      return () => {
        container.removeEventListener('scroll', handleScrollWrapper)
        container.removeEventListener('wheel', handleWheel)
        container.removeEventListener('touchstart', handleTouchStart)
        container.removeEventListener('touchend', handleTouchEnd)
      }
    }
  }, [shouldAutoScroll]) // Add shouldAutoScroll as dependency

  // Auto-scroll effect when messages change or when streaming
  useEffect(() => {
    if (!shouldAutoScroll || userScrollingRef.current) {
      return // Don't auto-scroll if user has scrolled up
    }

    // Only scroll if we're at the bottom or a new message has been added
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: isInitialLoad ? 'auto' : 'smooth',
      })
      if (isInitialLoad) {
        setIsInitialLoad(false)
      }
    })
  }, [
    messages.length, // Only depend on message count, not entire messages array
    shouldAutoScroll,
    isInitialLoad,
    setIsInitialLoad,
    messagesEndRef,
    isThinking,
    isWaitingForResponse, // Add these as dependencies to respond to streaming state
  ])

  if (!mounted) {
    return (
      <div ref={scrollContainerRef} className="h-full overflow-y-auto">
        <div ref={messagesEndRef} />
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div
        ref={scrollContainerRef}
        className="flex h-full items-center justify-center"
        style={{
          overflow: 'hidden',
          height: '100%',
          position: 'relative',
        }}
      >
        <div className="w-full max-w-xl px-8">
          <WelcomeScreen
            isDarkMode={isDarkMode}
            openAndExpandVerifier={openAndExpandVerifier}
          />
        </div>
        <div ref={messagesEndRef} className="hidden" />
      </div>
    )
  }

  return (
    <div
      ref={scrollContainerRef}
      className="h-full overflow-y-auto pb-8 sm:pb-16"
      style={{
        height: '100%',
        overflowY: 'auto',
        position: 'relative',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'none',
      }}
    >
      <div className="mx-auto w-full max-w-3xl pt-24">
        {/* Archived Messages - only shown if there are more than the max prompt messages */}
        {archivedMessages.length > 0 && (
          <>
            <div className={`opacity-70`}>
              {archivedMessages.map((message, i) => (
                <ChatMessage
                  key={`archived-${i}`}
                  message={message as MessageWithThoughts}
                  isDarkMode={isDarkMode}
                  shouldDiscardThoughts={false}
                  isLastMessage={false}
                  isWaitingForResponse={false}
                />
              ))}
            </div>

            {/* Separator */}
            <MessagesSeparator isDarkMode={isDarkMode} />
          </>
        )}

        {/* Live Messages - the last messages up to max prompt limit */}
        {liveMessages.map((message, i) => (
          <ChatMessage
            key={`${chatId}-${i}`}
            message={message as MessageWithThoughts}
            isDarkMode={isDarkMode}
            shouldDiscardThoughts={false}
            isLastMessage={i === liveMessages.length - 1}
            isWaitingForResponse={false}
          />
        ))}
        {isWaitingForResponse && <LoadingMessage isDarkMode={isDarkMode} />}
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}
