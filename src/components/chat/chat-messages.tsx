'use client'

import { type BaseModel } from '@/app/config/models'
import { useUser } from '@clerk/nextjs'
import { motion } from 'framer-motion'
import 'katex/dist/katex.min.css'
import React, { memo, useEffect, useMemo, useState } from 'react'
import { BsCheckLg, BsCopy } from 'react-icons/bs'
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
import { ChatInput } from './chat-input'
import { getFileIconType } from './document-uploader'
import { useMaxMessages } from './hooks/use-max-messages'
import { ModelSelector } from './model-selector'
import type { Message } from './types'
import { VerificationStatusDisplay } from './verification-status-display'

// We'll use a custom hook to load math plugins
function useMathPlugins() {
  const [plugins, setPlugins] = useState<{
    remarkPlugins: any[]
    rehypePlugins: any[]
  }>({
    remarkPlugins: [remarkGfm],
    rehypePlugins: [],
  })

  useEffect(() => {
    // Load math plugins only in browser
    if (typeof window !== 'undefined') {
      Promise.all([import('remark-math'), import('rehype-katex')])
        .then(([remarkMathMod, rehypeKatexMod]) => {
          setPlugins({
            remarkPlugins: [remarkGfm, remarkMathMod.default] as any[],
            rehypePlugins: [rehypeKatexMod.default] as any[],
          })
        })
        .catch(() => {
          // If loading fails, just use basic plugins
          console.warn('Math rendering plugins failed to load')
        })
    }
  }, [])

  return plugins
}

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
  verificationState?: any
  onSubmit?: (e: React.FormEvent) => void
  input?: string
  setInput?: (value: string) => void
  loadingState?: any
  cancelGeneration?: () => void
  inputRef?: React.RefObject<HTMLTextAreaElement>
  handleInputFocus?: () => void
  handleDocumentUpload?: (file: File) => Promise<void>
  processedDocuments?: any[]
  removeDocument?: (id: string) => void
  selectedModel?: string
  handleModelSelect?: (model: string) => void
  expandedLabel?: string | null
  handleLabelClick?: (
    label: 'verify' | 'model' | 'info',
    action: () => void,
  ) => void
}

// Lock animation moved to `./lock-animation`

// Add new component for thought process display
const ThoughtProcess = memo(function ThoughtProcess({
  thoughts,
  isDarkMode,
  isThinking = false,
  shouldDiscard = false,
  isCompleted = false,
  messageId,
  expandedThoughtsState,
  setExpandedThoughtsState,
}: {
  thoughts: string
  isDarkMode: boolean
  isThinking?: boolean
  shouldDiscard?: boolean
  isCompleted?: boolean
  messageId?: string
  expandedThoughtsState?: Record<string, boolean>
  setExpandedThoughtsState?: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >
}) {
  // Use lifted state if available, otherwise local state
  const isExpanded =
    messageId && expandedThoughtsState
      ? (expandedThoughtsState[messageId] ?? false)
      : false

  const handleToggle = () => {
    if (messageId && setExpandedThoughtsState) {
      setExpandedThoughtsState((prevState) => ({
        ...prevState,
        [messageId]: !prevState[messageId],
      }))
    }
  }
  const { remarkPlugins, rehypePlugins } = useMathPlugins()

  // Don't render if thoughts are empty and not actively thinking
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
        onClick={handleToggle}
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
          className={`px-4 py-3 text-sm ${
            isDarkMode ? 'text-gray-300' : 'text-gray-600'
          }`}
        >
          <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={{
              p: ({ children }: { children?: React.ReactNode }) => (
                <p className="mb-2 last:mb-0">{children}</p>
              ),
            }}
          >
            {thoughts}
          </ReactMarkdown>
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

  // Use the hook to get math plugins
  const { remarkPlugins, rehypePlugins } = useMathPlugins()

  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
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
            <code className={`${className || ''} break-words`} {...props}>
              {children}
            </code>
          )
        },
        table({ children, node, ...props }: any) {
          return (
            <div className="my-4 w-full overflow-x-auto">
              <table
                {...props}
                className={`divide-y ${isDarkMode ? 'divide-gray-600' : 'divide-gray-200'}`}
                style={{ minWidth: 'max-content' }}
              >
                {children}
              </table>
            </div>
          )
        },
        thead({ children, node, ...props }: any) {
          return (
            <thead
              {...props}
              className={isDarkMode ? 'bg-gray-700' : 'bg-gray-50'}
            >
              {children}
            </thead>
          )
        },
        tbody({ children, node, ...props }: any) {
          return (
            <tbody
              {...props}
              className={`divide-y ${isDarkMode ? 'divide-gray-700 bg-gray-800' : 'divide-gray-200 bg-white'}`}
            >
              {children}
            </tbody>
          )
        },
        tr({ children, node, ...props }: any) {
          return <tr {...props}>{children}</tr>
        },
        th({ children, node, ...props }: any) {
          return (
            <th
              {...props}
              className={`whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}
            >
              {children}
            </th>
          )
        },
        td({ children, node, ...props }: any) {
          return (
            <td
              {...props}
              className={`px-4 py-3 text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-900'} whitespace-nowrap`}
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
  expandedThoughtsState,
  setExpandedThoughtsState,
}: {
  message: MessageWithThoughts
  isDarkMode: boolean
  shouldDiscardThoughts?: boolean
  isLastMessage?: boolean
  isWaitingForResponse?: boolean
  expandedThoughtsState?: Record<string, boolean>
  setExpandedThoughtsState?: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >
}) {
  const isUser = message.role === 'user'
  const [isCopied, setIsCopied] = useState(false)

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
            messageId={`${message.timestamp}-${message.role}`}
            expandedThoughtsState={expandedThoughtsState}
            setExpandedThoughtsState={setExpandedThoughtsState}
          />
        </div>
      )}
      {/* Only show content if it exists and is not just document content */}
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
                    ? 'text-gray-100 prose-headings:text-gray-100 prose-a:text-gray-500 hover:prose-a:text-gray-400 prose-strong:text-gray-100 prose-code:text-gray-100 prose-pre:bg-transparent prose-pre:p-0'
                    : isUser
                      ? 'text-gray-900 prose-headings:text-gray-900 prose-a:text-gray-600 hover:prose-a:text-gray-700 prose-strong:text-gray-900 prose-code:text-gray-800 prose-pre:bg-transparent prose-pre:p-0'
                      : 'text-gray-900 prose-a:text-gray-500 hover:prose-a:text-gray-400 prose-code:text-gray-800 prose-pre:bg-transparent prose-pre:p-0'
                }`}
              >
                <MemoizedMarkdown
                  content={message.content}
                  isDarkMode={isDarkMode}
                />
              </div>
            </div>
          </div>
          {/* Copy button for assistant messages - hidden during streaming */}
          {!isUser && !(isLastMessage && isWaitingForResponse) && (
            <div className="mt-1 px-4">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(message.content)
                  setIsCopied(true)
                  setTimeout(() => setIsCopied(false), 2000)
                }}
                className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-all ${
                  isCopied
                    ? 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400'
                    : isDarkMode
                      ? 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-300'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
                aria-label="Copy message"
              >
                {isCopied ? (
                  <>
                    <BsCheckLg className="h-3.5 w-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <BsCopy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          )}
        </>
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
  verificationState,
  onSubmit,
  input,
  setInput,
  loadingState,
  cancelGeneration,
  inputRef,
  handleInputFocus,
  handleDocumentUpload,
  processedDocuments,
  removeDocument,
  selectedModel,
  handleModelSelect,
  expandedLabel,
  handleLabelClick,
}: {
  isDarkMode: boolean
  openAndExpandVerifier: () => void
  isPremium?: boolean
  models?: BaseModel[]
  subscriptionLoading?: boolean
  verificationState?: any
  onSubmit?: (e: React.FormEvent) => void
  input?: string
  setInput?: (value: string) => void
  loadingState?: any
  cancelGeneration?: () => void
  inputRef?: React.RefObject<HTMLTextAreaElement>
  handleInputFocus?: () => void
  handleDocumentUpload?: (file: File) => Promise<void>
  processedDocuments?: any[]
  removeDocument?: (id: string) => void
  selectedModel?: string
  handleModelSelect?: (model: string) => void
  expandedLabel?: string | null
  handleLabelClick?: (
    label: 'verify' | 'model' | 'info',
    action: () => void,
  ) => void
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
      <div className="w-full">
        <div className="grid grid-cols-1 items-start">
          <motion.h1
            className={`flex items-center gap-3 text-2xl font-medium tracking-tight md:text-3xl ${
              isDarkMode ? 'text-gray-100' : 'text-gray-800'
            }`}
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

          <div className="mt-4 md:mt-8">
            <motion.p
              className={`${isDarkMode ? 'text-gray-300' : 'text-gray-600'} text-lg`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: 0.5,
                ease: 'easeOut',
                delay: 0.3,
              }}
            >
              This conversation is private: nobody can see your messages.
            </motion.p>
            <motion.p
              className={`${isDarkMode ? 'text-gray-400' : 'text-gray-500'} mt-1 text-sm leading-6`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: 0.5,
                ease: 'easeOut',
                delay: 0.3,
              }}
            >
              Each message is end‑to‑end encrypted and <em>only</em> processed
              inside secure hardware enclaves.
            </motion.p>

            {/* Model Selector - Desktop only */}
            {isPremium && models && selectedModel && handleModelSelect && (
              <motion.div
                className="mt-8 hidden md:block"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  duration: 0.5,
                  ease: 'easeOut',
                  delay: 0.35,
                }}
              >
                <div className="relative">
                  <button
                    type="button"
                    data-model-selector
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (handleLabelClick) {
                        handleLabelClick('model', () => {})
                      }
                    }}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                      isDarkMode
                        ? 'bg-gray-700 hover:bg-gray-600'
                        : 'bg-gray-100 hover:bg-gray-200'
                    } transition-colors`}
                  >
                    {(() => {
                      const model = models.find(
                        (m) => m.modelName === selectedModel,
                      )
                      if (!model) return null
                      return (
                        <>
                          <img
                            src={
                              model.modelName
                                .toLowerCase()
                                .includes('openai') ||
                              model.modelName.toLowerCase().includes('gpt')
                                ? isDarkMode
                                  ? '/model-icons/openai-dark.png'
                                  : '/model-icons/openai-light.png'
                                : model.image
                            }
                            alt={model.name}
                            className="h-5 w-5"
                          />
                          <span
                            className={`text-sm font-medium ${
                              isDarkMode ? 'text-gray-200' : 'text-gray-700'
                            }`}
                          >
                            {model.name}
                          </span>
                          <svg
                            className={`h-4 w-4 ${
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
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </>
                      )
                    })()}
                  </button>

                  {expandedLabel === 'model' && handleModelSelect && (
                    <ModelSelector
                      selectedModel={selectedModel}
                      onSelect={handleModelSelect}
                      isDarkMode={isDarkMode}
                      isPremium={isPremium}
                      models={models}
                      preferredPosition="below"
                    />
                  )}
                </div>
              </motion.div>
            )}

            {/* Centered Chat Input - Desktop only */}
            {onSubmit && input !== undefined && setInput && (
              <motion.div
                className="mt-8 hidden md:block"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  duration: 0.5,
                  ease: 'easeOut',
                  delay: 0.4,
                }}
              >
                <ChatInput
                  input={input}
                  setInput={setInput}
                  handleSubmit={onSubmit}
                  loadingState={loadingState}
                  cancelGeneration={cancelGeneration || (() => {})}
                  inputRef={inputRef || React.createRef()}
                  handleInputFocus={handleInputFocus || (() => {})}
                  inputMinHeight="28px"
                  isDarkMode={isDarkMode}
                  handleDocumentUpload={handleDocumentUpload}
                  processedDocuments={processedDocuments}
                  removeDocument={removeDocument}
                  isPremium={isPremium}
                  hasMessages={false}
                />
              </motion.div>
            )}

            {/* Verification Status Display - Compact mode on all screen sizes */}
            <div className="mt-4 md:mt-8">
              <VerificationStatusDisplay
                isDarkMode={isDarkMode}
                onOpenVerifier={openAndExpandVerifier}
                verificationState={verificationState}
                isCompact={true}
              />
            </div>
          </div>
        </div>
      </div>
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
  verificationState,
  onSubmit,
  input,
  setInput,
  loadingState,
  cancelGeneration,
  inputRef,
  handleInputFocus,
  handleDocumentUpload,
  processedDocuments,
  removeDocument,
  selectedModel,
  handleModelSelect,
  expandedLabel,
  handleLabelClick,
}: ChatMessagesProps) {
  const [mounted, setMounted] = useState(false)
  const [expandedThoughtsState, setExpandedThoughtsState] = useState<
    Record<string, boolean>
  >({})
  const maxMessages = useMaxMessages()

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
        <div className="w-full max-w-4xl px-8">
          <WelcomeScreen
            isDarkMode={isDarkMode}
            openAndExpandVerifier={openAndExpandVerifier}
            isPremium={isPremium}
            models={models}
            subscriptionLoading={subscriptionLoading}
            verificationState={verificationState}
            onSubmit={onSubmit}
            input={input}
            setInput={setInput}
            loadingState={loadingState}
            cancelGeneration={cancelGeneration}
            inputRef={inputRef}
            handleInputFocus={handleInputFocus}
            handleDocumentUpload={handleDocumentUpload}
            processedDocuments={processedDocuments}
            removeDocument={removeDocument}
            selectedModel={selectedModel}
            handleModelSelect={handleModelSelect}
            expandedLabel={expandedLabel}
            handleLabelClick={handleLabelClick}
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
                isWaitingForResponse={isWaitingForResponse}
                expandedThoughtsState={expandedThoughtsState}
                setExpandedThoughtsState={setExpandedThoughtsState}
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
          isWaitingForResponse={isWaitingForResponse}
          expandedThoughtsState={expandedThoughtsState}
          setExpandedThoughtsState={setExpandedThoughtsState}
        />
      ))}
      {isWaitingForResponse && <LoadingMessage isDarkMode={isDarkMode} />}
      <div ref={messagesEndRef} />
    </div>
  )
}
