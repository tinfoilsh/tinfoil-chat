'use client'

import { type BaseModel } from '@/app/config/models'
import { useUser } from '@clerk/nextjs'
import { MicrophoneIcon } from '@heroicons/react/24/outline'
import { motion } from 'framer-motion'
import { memo, useEffect, useMemo, useState } from 'react'
import {
  FaFile,
  FaFileAlt,
  FaFileArchive,
  FaFileAudio,
  FaFileCode,
  FaFileExcel,
  FaFileImage,
  FaFilePdf,
  FaFilePowerpoint,
  FaFileVideo,
  FaFileWord,
} from 'react-icons/fa'
import { LuBrain } from 'react-icons/lu'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from '../code-block'
import { LoadingDots } from '../loading-dots'
import { getFileIconType } from './document-uploader'
import { useMaxMessages } from './hooks/use-max-messages'
import type { Message } from './types'

// Static array to prevent recreation on every render
const remarkPlugins = [remarkGfm]

// Add new types
type MessageWithThoughts = Message & {
  thoughts?: string
  isThinking?: boolean
}

type ChatMessagesProps = {
  messages: Message[]
  isDarkMode: boolean
  chatId: string
  messagesEndRef: React.RefObject<HTMLDivElement>
  openAndExpandVerifier: () => void
  isWaitingForResponse?: boolean
  isPremium?: boolean
  models?: BaseModel[]
  subscriptionLoading?: boolean
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
  // Always start collapsed - user must click to expand
  const [isExpanded, setIsExpanded] = useState(false)

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
  // Convert single newlines to markdown line breaks (two spaces + newline)
  const processedContent = content.replace(/\n/g, '  \n')

  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      components={{
        code({
          node,
          className,
          children,
          ...props
        }: {
          node?: unknown
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
        table({ children, node, ...props }) {
          return (
            <div className="my-4 overflow-x-auto">
              <table
                {...props}
                className={`min-w-full divide-y ${isDarkMode ? 'divide-gray-600' : 'divide-gray-200'}`}
              >
                {children}
              </table>
            </div>
          )
        },
        thead({ children, node, ...props }) {
          return (
            <thead
              {...props}
              className={isDarkMode ? 'bg-gray-700' : 'bg-gray-50'}
            >
              {children}
            </thead>
          )
        },
        tbody({ children, node, ...props }) {
          return (
            <tbody
              {...props}
              className={`divide-y ${isDarkMode ? 'divide-gray-700 bg-gray-800' : 'divide-gray-200 bg-white'}`}
            >
              {children}
            </tbody>
          )
        },
        tr({ children, node, ...props }) {
          return <tr {...props}>{children}</tr>
        },
        th({ children, node, ...props }) {
          return (
            <th
              {...props}
              className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}
            >
              {children}
            </th>
          )
        },
        td({ children, node, ...props }) {
          return (
            <td
              {...props}
              className={`px-4 py-3 text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-900'} whitespace-normal break-words`}
            >
              {children}
            </td>
          )
        },
      }}
    >
      {processedContent}
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
    const type = getFileIconType(filename)
    const iconProps = {
      className: `h-5 w-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`,
    }
    switch (type) {
      case 'pdf':
        return <FaFilePdf {...iconProps} />
      case 'docx':
        return <FaFileWord {...iconProps} />
      case 'pptx':
        return <FaFilePowerpoint {...iconProps} />
      case 'xlsx':
      case 'csv':
        return <FaFileExcel {...iconProps} />
      case 'image':
        return <FaFileImage {...iconProps} />
      case 'audio':
        return <FaFileAudio {...iconProps} />
      case 'video':
        return <FaFileVideo {...iconProps} />
      case 'zip':
        return <FaFileArchive {...iconProps} />
      case 'html':
      case 'js':
      case 'ts':
      case 'css':
      case 'md':
        return <FaFileCode {...iconProps} />
      case 'txt':
        return <FaFileAlt {...iconProps} />
      default:
        return <FaFile {...iconProps} />
    }
  }

  return (
    <div
      className={`flex flex-col ${isUser ? 'items-end' : 'w-full items-start'} group mb-6`}
    >
      {/* Display document icons for user messages */}
      {isUser && message.documents && message.documents.length > 0 && (
        <div className="mb-2 flex flex-wrap justify-end gap-2 px-4">
          {message.documents.map((doc, index) => {
            // Check if we have corresponding image data
            const hasImageData = message.imageData && message.imageData[index]
            const isImage = doc.name
              .toLowerCase()
              .match(/\.(jpg|jpeg|png|gif|webp|bmp|tiff)$/i)

            return (
              <div
                key={index}
                className={`flex items-center rounded-lg ${
                  isDarkMode
                    ? 'bg-gray-700/50 hover:bg-gray-700/70'
                    : 'bg-gray-100 hover:bg-gray-200'
                } overflow-hidden transition-colors duration-200`}
              >
                {hasImageData && isImage ? (
                  <div className="flex items-center">
                    <div className="h-10 w-10 overflow-hidden">
                      <img
                        src={`data:${message.imageData![index].mimeType};base64,${message.imageData![index].base64}`}
                        alt={doc.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <span
                      className={`ml-2 mr-3 max-w-[150px] truncate text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}
                    >
                      {doc.name}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center px-3 py-1.5">
                    <div className="mr-2">{getFileIcon(doc.name)}</div>
                    <span
                      className={`max-w-[150px] truncate text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}
                    >
                      {doc.name}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
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
  isPremium,
  models,
  subscriptionLoading,
}: {
  isDarkMode: boolean
  openAndExpandVerifier: () => void
  isPremium?: boolean
  models?: BaseModel[]
  subscriptionLoading?: boolean
}) {
  const { user } = useUser()
  const [nickname, setNickname] = useState<string>('')

  // Load nickname from localStorage and listen for changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedNickname = localStorage.getItem('userNickname')
      if (savedNickname) {
        setNickname(savedNickname)
      }

      // Listen for personalization changes
      const handlePersonalizationChange = (event: CustomEvent) => {
        setNickname(event.detail.nickname || '')
      }

      window.addEventListener(
        'personalizationChanged',
        handlePersonalizationChange as EventListener,
      )

      return () => {
        window.removeEventListener(
          'personalizationChanged',
          handlePersonalizationChange as EventListener,
        )
      }
    }
  }, [])

  // Determine the greeting text
  const getGreeting = () => {
    if (nickname) {
      return `Hello, ${nickname}!`
    }
    if (user?.firstName) {
      return `Hello, ${user.firstName}!`
    }
    return 'Tinfoil Private Chat'
  }

  // Get premium models for display - include both premium-only and conditional models
  const premiumModels =
    models?.filter(
      (model) =>
        model.type === 'chat' && model.chat === true && model.paid === true,
    ) || []

  // Show loading state while subscription is loading
  if (subscriptionLoading) {
    return (
      <div className="w-full animate-pulse">
        <div
          className={`mb-6 h-9 rounded-lg bg-gradient-to-r ${
            isDarkMode
              ? 'from-gray-700 to-gray-600'
              : 'from-gray-200 to-gray-300'
          }`}
        />

        <div className="space-y-4">
          {[1, 2, 3].map((index) => (
            <div key={index} className="flex items-start gap-3">
              <div
                className={`mt-1 h-5 w-5 flex-shrink-0 rounded bg-gradient-to-r ${
                  isDarkMode
                    ? 'from-gray-700 to-gray-600'
                    : 'from-gray-200 to-gray-300'
                }`}
              />
              <div
                className={`h-5 flex-1 rounded bg-gradient-to-r ${
                  isDarkMode
                    ? 'from-gray-700 to-gray-600'
                    : 'from-gray-200 to-gray-300'
                }`}
              />
            </div>
          ))}
        </div>

        <div className="mt-12">
          <div
            className={`mb-4 h-6 w-64 rounded bg-gradient-to-r ${
              isDarkMode
                ? 'from-gray-700 to-gray-600'
                : 'from-gray-200 to-gray-300'
            }`}
          />
          <div className="space-y-3">
            {[1, 2].map((index) => (
              <div key={index} className="flex items-center gap-3">
                <div
                  className={`h-4 w-4 flex-shrink-0 rounded bg-gradient-to-r ${
                    isDarkMode
                      ? 'from-gray-700 to-gray-600'
                      : 'from-gray-200 to-gray-300'
                  }`}
                />
                <div
                  className={`h-4 w-32 rounded bg-gradient-to-r ${
                    isDarkMode
                      ? 'from-gray-700 to-gray-600'
                      : 'from-gray-200 to-gray-300'
                  }`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      className="w-full"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.6,
        ease: 'easeOut',
        delay: 0.1,
      }}
    >
      <motion.h1
        className={`font-display text-3xl font-medium tracking-tight ${
          isDarkMode ? 'text-gray-100' : 'text-gray-800'
        } mb-6`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.5,
          ease: 'easeOut',
          delay: 0.2,
        }}
      >
        {getGreeting()}
      </motion.h1>

      <motion.p
        className={`${isDarkMode ? 'text-gray-300' : 'text-gray-600'} mb-12 text-lg`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          duration: 0.5,
          ease: 'easeOut',
          delay: 0.3,
        }}
      >
        This conversation is completely private, nobody can see your messages -
        not even Tinfoil.
      </motion.p>

      {/* Premium upgrade section for non-premium users - only show after subscription status is loaded */}
      {!subscriptionLoading && !isPremium && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.5,
            ease: 'easeOut',
            delay: 0.5,
          }}
        >
          <div
            className={`rounded-xl border ${
              isDarkMode
                ? 'border-emerald-500/30 bg-emerald-950/20'
                : 'border-emerald-500/30 bg-emerald-50/50'
            } p-6`}
          >
            <h3
              className={`mb-4 text-base font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
            >
              Get more out of Tinfoil Chat
            </h3>
            <div className="space-y-3">
              <div
                className={`flex items-center gap-3 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
              >
                <MicrophoneIcon
                  className={`h-4 w-4 flex-shrink-0 ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}
                />
                <span>Speech-to-text voice input</span>
              </div>

              <div
                className={`flex items-center gap-3 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
              >
                <svg
                  className={`h-4 w-4 flex-shrink-0 ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                  />
                </svg>
                <span>Premium AI models</span>
                {premiumModels.length > 0 && (
                  <div className="ml-2 flex items-center gap-1.5">
                    {premiumModels.map((model) => (
                      <img
                        key={model.modelName}
                        src={model.image}
                        alt={model.name}
                        className="h-4 w-4 opacity-75"
                        title={model.name}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div
                className={`flex items-center gap-3 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
              >
                <svg
                  className={`h-4 w-4 flex-shrink-0 ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                <span>Faster response times</span>
              </div>
            </div>
            <div className="mt-6">
              <a
                href="https://tinfoil.sh/pricing"
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 text-sm font-medium transition-colors ${
                  isDarkMode
                    ? 'text-emerald-400 hover:text-emerald-300'
                    : 'text-emerald-600 hover:text-emerald-500'
                }`}
              >
                Upgrade to Pro
                <svg
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </a>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
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
  isDarkMode,
  chatId,
  messagesEndRef,
  openAndExpandVerifier,
  isWaitingForResponse = false,
  isPremium,
  models,
  subscriptionLoading,
}: ChatMessagesProps) {
  const [mounted, setMounted] = useState(false)
  const maxMessages = useMaxMessages()

  // Check if there's already a thinking message in the chat
  const hasThinkingMessage = messages.some(
    (msg) => (msg as MessageWithThoughts).isThinking,
  )

  // Separate messages into archived and live sections - memoize this calculation
  const { archivedMessages, liveMessages } = useMemo(() => {
    const archived =
      messages.length > maxMessages ? messages.slice(0, -maxMessages) : []
    const live =
      messages.length > maxMessages ? messages.slice(-maxMessages) : messages
    return { archivedMessages: archived, liveMessages: live }
  }, [messages, maxMessages])

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="h-full">
        <div ref={messagesEndRef} />
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{
          height: '100%',
          position: 'relative',
        }}
      >
        <div className="w-full max-w-xl px-8">
          <WelcomeScreen
            isDarkMode={isDarkMode}
            openAndExpandVerifier={openAndExpandVerifier}
            isPremium={isPremium}
            models={models}
            subscriptionLoading={subscriptionLoading}
          />
        </div>
        <div ref={messagesEndRef} className="hidden" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-24">
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
  )
}
