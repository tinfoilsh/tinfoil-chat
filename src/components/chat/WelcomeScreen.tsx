import { type BaseModel } from '@/config/models'
import { useClerk, useUser } from '@clerk/nextjs'
import { AnimatePresence, motion } from 'framer-motion'
import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { BiSolidLock } from 'react-icons/bi'
import { ChatInput } from './chat-input'
import { CONSTANTS } from './constants'
import { DataFlowDiagram } from './DataFlowDiagram'
import { ModelSelector } from './model-selector'
import type { ProcessedDocument } from './renderers/types'
import type { LabelType, LoadingState } from './types'

const CIPHER_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const DECRYPT_DURATION_MS = 3000
const DECRYPT_DELAY_MS = 300
const DECRYPT_INITIAL_PROGRESS = 0.5
const DECRYPT_ZIPF_EXPONENT = 20

type Segment =
  | { type: 'text'; content: string }
  | {
      type: 'link'
      content: string
      href: string
    }
  | {
      type: 'button'
      content: string
      onClick: () => void
    }

function DecryptText({
  segments,
  animate,
}: {
  segments: Segment[]
  animate: boolean
}) {
  const spanRefs = useRef<(HTMLSpanElement | null)[]>([])
  const wrapperRef = useRef<HTMLDivElement>(null)
  const animatingRef = useRef(false)
  const segmentsRef = useRef(segments)
  segmentsRef.current = segments

  // Pre-compute flat character list with segment/char indices
  const flatChars = useRef<{ segIdx: number; charIdx: number }[]>([])

  useLayoutEffect(() => {
    const chars: { segIdx: number; charIdx: number }[] = []
    segments.forEach((seg, segIdx) => {
      for (let i = 0; i < seg.content.length; i++) {
        chars.push({ segIdx, charIdx: i })
      }
    })
    flatChars.current = chars
  }, [segments])

  useEffect(() => {
    const segs = segmentsRef.current
    const isMobile = window.matchMedia('(max-width: 767px)').matches

    if (!animate || isMobile) {
      segs.forEach((seg, i) => {
        const span = spanRefs.current[i]
        if (span) span.textContent = seg.content
      })
      return
    }

    animatingRef.current = true
    const totalChars = flatChars.current.length
    const startTime = performance.now() + DECRYPT_DELAY_MS

    // Assign each character a random resolve threshold (0–1)
    const resolveAt = flatChars.current.map(
      (_, i) => ((i * 2654435761) >>> 0) / 4294967296,
    )

    const buffers = segs.map((seg) => [...seg.content])

    const step = (now: number) => {
      if (!animatingRef.current) return

      const elapsed = now - startTime
      const raw = Math.min(1, Math.max(0, elapsed / DECRYPT_DURATION_MS))
      const done = raw >= 1
      const eased = 1 - Math.pow(1 - raw, DECRYPT_ZIPF_EXPONENT)
      const progress =
        DECRYPT_INITIAL_PROGRESS + eased * (1 - DECRYPT_INITIAL_PROGRESS)

      const cycleTick = Math.floor(now / 80)

      for (let i = 0; i < totalChars; i++) {
        const { segIdx, charIdx } = flatChars.current[i]
        const realChar = segs[segIdx].content[charIdx]

        if (done || progress >= resolveAt[i] || realChar === ' ') {
          buffers[segIdx][charIdx] = realChar
        } else {
          const seed = (i * 13 + cycleTick) % CIPHER_CHARS.length
          buffers[segIdx][charIdx] = CIPHER_CHARS[seed]
        }
      }

      segs.forEach((_, i) => {
        const span = spanRefs.current[i]
        if (span) span.textContent = buffers[i].join('')
      })

      if (!done) {
        requestAnimationFrame(step)
      }
    }

    requestAnimationFrame(step)

    return () => {
      animatingRef.current = false
    }
    // Only run on mount (animate is always true when mounted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <span ref={wrapperRef} className="relative block">
      {/* Invisible layer to establish correct height */}
      <span aria-hidden="true" className="invisible">
        {segments.map((seg, i) => {
          if (seg.type === 'link') {
            return (
              <a
                key={i}
                className="text-brand-accent-dark dark:text-brand-accent-light"
              >
                {seg.content}
              </a>
            )
          }
          if (seg.type === 'button') {
            return (
              <span
                key={i}
                className="text-brand-accent-dark dark:text-brand-accent-light"
              >
                {seg.content}
              </span>
            )
          }
          return <span key={i}>{seg.content}</span>
        })}
      </span>
      {/* Visible animated layer */}
      <span className="absolute inset-0">
        {segments.map((seg, i) => {
          const ref = (el: HTMLSpanElement | null) => {
            spanRefs.current[i] = el
          }

          if (seg.type === 'link') {
            return (
              <a
                key={i}
                href={seg.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-accent-dark transition-opacity hover:opacity-80 dark:text-brand-accent-light"
              >
                <span ref={ref} />
              </a>
            )
          }

          if (seg.type === 'button') {
            return (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  seg.onClick()
                }}
                className="text-brand-accent-dark transition-opacity hover:opacity-80 dark:text-brand-accent-light"
              >
                <span ref={ref} />
              </button>
            )
          }

          return <span key={i} ref={ref} />
        })}
      </span>
    </span>
  )
}

interface WelcomeScreenProps {
  isDarkMode: boolean
  setIsSidebarOpen?: (isOpen: boolean) => void
  isPremium?: boolean
  models?: BaseModel[]
  subscriptionLoading?: boolean
  onSubmit?: (e: React.FormEvent) => void
  input?: string
  setInput?: (value: string) => void
  loadingState?: LoadingState
  cancelGeneration?: () => void
  inputRef?: React.RefObject<HTMLTextAreaElement>
  handleInputFocus?: () => void
  handleDocumentUpload?: (file: File) => Promise<void>
  processedDocuments?: ProcessedDocument[]
  removeDocument?: (id: string) => void
  selectedModel?: string
  handleModelSelect?: (model: string) => void
  expandedLabel?: LabelType
  handleLabelClick?: (
    label: Exclude<LabelType, null>,
    action: () => void,
  ) => void
  webSearchEnabled?: boolean
  onWebSearchToggle?: () => void
  onOpenVerifier?: () => void
}

export const WelcomeScreen = memo(function WelcomeScreen({
  isDarkMode,
  setIsSidebarOpen,
  isPremium,
  models,
  subscriptionLoading,
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
  webSearchEnabled,
  onWebSearchToggle,
  onOpenVerifier,
}: WelcomeScreenProps) {
  const { user, isSignedIn } = useUser()
  const { openSignIn } = useClerk()
  const [nickname, setNickname] = useState<string>('')
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({})
  const [privacyExpanded, setPrivacyExpanded] = useState(false)
  const [lockPop, setLockPop] = useState(false)
  const fallbackInputRef = useRef<HTMLTextAreaElement>(null)

  const handleImageError = useCallback((modelName: string) => {
    setFailedImages((prev) => ({ ...prev, [modelName]: true }))
  }, [])

  // Load nickname from localStorage and listen for changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Clear nickname when user changes or is not authenticated
      if (!user?.id) {
        setNickname('')
        return
      }

      const savedNickname = localStorage.getItem('userNickname')
      if (savedNickname) {
        setNickname(savedNickname)
      }

      // Listen for personalization changes
      const handlePersonalizationChange = (event: CustomEvent) => {
        setNickname(event.detail?.nickname ?? '')
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
  }, [user?.id])

  // Determine the greeting text based on time of day
  const getGreeting = () => {
    const name = nickname || user?.firstName
    if (!name) {
      return 'Tinfoil Private Chat'
    }

    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) {
      return `Good morning, ${name}!`
    } else if (hour >= 12 && hour < 17) {
      return `Good afternoon, ${name}!`
    } else if (hour >= 17 && hour < 22) {
      return `Good evening, ${name}!`
    } else {
      return `Up late, ${name}?`
    }
  }

  // Don't show loading skeleton - show the welcome screen immediately
  // Models will populate when they're loaded

  return (
    <motion.div
      className={`flex w-full justify-center ${privacyExpanded ? 'items-start' : 'min-h-[60vh] items-center md:min-h-0 md:items-start'}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.6,
        ease: 'easeOut',
        delay: 0.1,
      }}
    >
      <div className="flex w-full justify-center">
        <div className="w-full max-w-2xl">
          <motion.h1
            className={`flex items-center gap-3 text-2xl font-medium tracking-tight text-content-primary md:justify-start md:text-3xl ${privacyExpanded ? 'justify-start' : 'justify-center'}`}
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

          {/* Privacy explainer */}
          <motion.div
            className="mt-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: 0.5,
              ease: 'easeOut',
              delay: 0.3,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setPrivacyExpanded((prev) => {
                  if (!prev) setLockPop(true)
                  else setLockPop(false)
                  return !prev
                })
              }}
              className={`group flex w-full items-center gap-2 text-base text-content-secondary transition-colors hover:text-content-primary md:justify-start ${privacyExpanded ? 'justify-start' : 'justify-center'}`}
            >
              <motion.span
                className="inline-flex shrink-0"
                animate={lockPop ? { scale: [1, 1.5, 0.9, 1] } : { scale: 1 }}
                transition={
                  lockPop
                    ? {
                        duration: 0.7,
                        times: [0, 0.3, 0.6, 1],
                        ease: 'easeInOut',
                      }
                    : { duration: 0 }
                }
              >
                <BiSolidLock className="h-4 w-4 text-brand-accent-dark dark:text-brand-accent-light" />
              </motion.span>
              <span>Your chats are private by design</span>
              <svg
                className={`h-3.5 w-3.5 shrink-0 opacity-50 transition-transform duration-300 ${privacyExpanded ? 'rotate-180' : ''}`}
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
            </button>

            <AnimatePresence initial={false}>
              {privacyExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    height: {
                      duration: 0.3,
                      ease: [0.25, 0.1, 0.25, 1],
                    },
                    opacity: {
                      duration: 0.25,
                      delay: 0.1,
                      ease: 'easeOut',
                    },
                  }}
                  className="overflow-hidden"
                >
                  <p className="mt-2 text-left text-base leading-relaxed text-content-secondary">
                    <DecryptText
                      animate={privacyExpanded}
                      segments={[
                        {
                          type: 'text',
                          content:
                            'Your messages are encrypted directly to the AI models running inside ',
                        },
                        {
                          type: 'link',
                          content: 'secure hardware enclaves. ',
                          href: 'https://tinfoil.sh/technology',
                        },
                        {
                          type: 'text',
                          content:
                            'These are hardware-isolated environments powered by confidential computing GPUs with verifiable confidentiality and integrity guarantees. Not even Tinfoil can access your data. This applies to all chats, images, documents, and voice input. Our ',
                        },
                        {
                          type: 'link',
                          content: 'open-source',
                          href: 'https://github.com/tinfoilsh',
                        },
                        {
                          type: 'text',
                          content: ' stack lets you ',
                        },
                        {
                          type: 'button',
                          content: 'verify this yourself',
                          onClick: () => onOpenVerifier?.(),
                        },
                        {
                          type: 'text',
                          content: ' by inspecting the hardware attestation.',
                        },
                      ]}
                    />
                  </p>
                  <DataFlowDiagram />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <div className="mt-8">
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
                  loadingState={loadingState ?? 'idle'}
                  cancelGeneration={cancelGeneration ?? (() => {})}
                  inputRef={inputRef ?? fallbackInputRef}
                  handleInputFocus={handleInputFocus ?? (() => {})}
                  inputMinHeight="60px"
                  isDarkMode={isDarkMode}
                  handleDocumentUpload={handleDocumentUpload}
                  processedDocuments={processedDocuments}
                  removeDocument={removeDocument}
                  isPremium={isPremium}
                  hasMessages={false}
                  audioModel={
                    (
                      models?.find(
                        (m) => m.modelName === CONSTANTS.DEFAULT_AUDIO_MODEL,
                      ) || models?.find((m) => m.type === 'audio')
                    )?.modelName
                  }
                  modelSelectorButton={
                    models &&
                    selectedModel &&
                    handleModelSelect &&
                    handleLabelClick ? (
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
                          className="flex items-center gap-1 text-content-secondary transition-colors hover:text-content-primary"
                        >
                          {(() => {
                            const model = models.find(
                              (m) => m.modelName === selectedModel,
                            )
                            if (!model) return null
                            return (
                              <>
                                <span className="text-xs font-medium">
                                  {model.name}
                                </span>
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
                            isPremium={isPremium ?? false}
                            models={models}
                            preferredPosition="below"
                            onPremiumModelClick={() => {
                              if (!isSignedIn) {
                                if (handleLabelClick) {
                                  handleLabelClick('model', () => {})
                                }
                                void openSignIn()
                                return
                              }
                              if (setIsSidebarOpen) {
                                setIsSidebarOpen(true)
                                window.dispatchEvent(
                                  new CustomEvent('highlightSidebarBox', {
                                    detail: { isPremium },
                                  }),
                                )
                              }
                            }}
                          />
                        )}
                      </div>
                    ) : undefined
                  }
                  webSearchEnabled={webSearchEnabled}
                  onWebSearchToggle={onWebSearchToggle}
                />
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
})
