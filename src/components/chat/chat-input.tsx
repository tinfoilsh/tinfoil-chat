import { FiArrowUp } from '@/components/icons/lazy-icons'
import { useProject } from '@/components/project'
import { cn } from '@/components/ui/utils'
import { useToast } from '@/hooks/use-toast'
import { getTinfoilClient } from '@/services/inference/tinfoil-client'
import { logError } from '@/utils/error-handling'
import {
  convertWebMToWAV,
  isImageFile,
  isWebMAudioSupported,
} from '@/utils/preprocessing'
import {
  FolderIcon,
  MicrophoneIcon,
  StopIcon,
} from '@heroicons/react/24/outline'
import type { FormEvent, RefObject } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  PiGlobe,
  PiGlobeX,
  PiPaperclipLight,
  PiPlusLight,
  PiSpinner,
} from 'react-icons/pi'
import { MacFileIcon } from './components/mac-file-icon'
import { CONSTANTS } from './constants'
import type { ProcessedDocument } from './renderers/types'
import type { LoadingState } from './types'

type ChatInputProps = {
  input: string
  setInput: (value: string) => void
  handleSubmit: (e: FormEvent) => void
  loadingState: LoadingState
  cancelGeneration: () => void
  inputRef: RefObject<HTMLTextAreaElement>
  handleInputFocus: () => void
  inputMinHeight: string
  isDarkMode: boolean
  handleDocumentUpload?: (file: File) => Promise<void>
  processedDocuments?: ProcessedDocument[]
  removeDocument?: (id: string) => void
  isPremium?: boolean
  hasMessages?: boolean
  audioModel?: string
  modelSelectorButton?: React.ReactNode
  webSearchEnabled?: boolean
  onWebSearchToggle?: () => void
}

export function ChatInput({
  input,
  setInput,
  handleSubmit,
  loadingState,
  cancelGeneration,
  inputRef,
  handleInputFocus,
  inputMinHeight,
  isDarkMode,
  handleDocumentUpload,
  processedDocuments,
  removeDocument,
  isPremium,
  hasMessages,
  audioModel,
  modelSelectorButton,
  webSearchEnabled,
  onWebSearchToggle,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const documentsScrollRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const { isProjectMode, activeProject } = useProject()

  // --- Speech-to-text state ---
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- Drag and drop state (for welcome screen when no parent drag area exists) ---
  const [isDragOver, setIsDragOver] = useState(false)

  // --- Mobile attachment menu state ---
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // Random placeholder - use first one initially to avoid SSR hydration mismatch,
  // then randomize after mount
  const [placeholder, setPlaceholder] = useState<string>(
    CONSTANTS.INPUT_PLACEHOLDERS[0],
  )

  useEffect(() => {
    setPlaceholder(
      CONSTANTS.INPUT_PLACEHOLDERS[
        Math.floor(Math.random() * CONSTANTS.INPUT_PLACEHOLDERS.length)
      ],
    )
  }, [])

  // Scroll to the end when new documents are added
  useEffect(() => {
    if (documentsScrollRef.current && processedDocuments?.length) {
      documentsScrollRef.current.scrollLeft =
        documentsScrollRef.current.scrollWidth
    }
  }, [processedDocuments?.length])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0 && handleDocumentUpload) {
        const files = Array.from(e.target.files)
        for (const file of files) {
          if (!isPremium && isImageFile(file)) {
            continue
          }
          handleDocumentUpload(file)
        }
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    },
    [handleDocumentUpload, isPremium],
  )

  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop()
    }
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current)
      recordingTimeoutRef.current = null
    }
    setIsRecording(false)
  }, [])

  const sendAudioForTranscription = useCallback(
    async (blob: Blob) => {
      try {
        setIsTranscribing(true)

        if (!audioModel) {
          throw new Error('No audio model available for transcription')
        }

        const client = await getTinfoilClient()
        const file = new File([blob], 'audio.wav', { type: 'audio/wav' })

        const transcription = await client.audio.transcriptions.create({
          file,
          model: audioModel,
          response_format: 'text',
        })

        const text =
          typeof transcription === 'string'
            ? transcription
            : (transcription as any).text

        if (text) {
          const currentInput = input.trim()
          const newText = text.trim()

          if (currentInput) {
            setInput(currentInput + ' ' + newText)
          } else {
            setInput(newText)
          }
        } else {
          throw new Error('No transcription text received')
        }
      } catch (err) {
        toast({
          title: 'Transcription Error',
          description:
            err instanceof Error ? err.message : 'Failed to transcribe audio',
          variant: 'destructive',
          position: 'top-left',
        })
      } finally {
        setIsTranscribing(false)
      }
    },
    [setInput, toast, input, audioModel],
  )

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 44100,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      if (!isWebMAudioSupported()) {
        throw new Error('WebM audio recording is not supported in this browser')
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
        audioBitsPerSecond: 128000,
      })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        try {
          // Stop all tracks
          stream.getTracks().forEach((track) => track.stop())

          // Create WebM blob
          const webmBlob = new Blob(audioChunksRef.current, {
            type: 'audio/webm',
          })
          audioChunksRef.current = []

          if (webmBlob.size === 0) {
            throw new Error('No audio data recorded')
          }

          setIsConverting(true)

          // Convert WebM to WAV
          const wavBlob = await convertWebMToWAV(webmBlob)

          setIsConverting(false)

          // Send WAV for transcription
          sendAudioForTranscription(wavBlob)
        } catch (err) {
          toast({
            title: 'Recording Error',
            description:
              err instanceof Error
                ? err.message
                : 'Failed to process audio recording.',
            variant: 'destructive',
            position: 'top-left',
          })
          setIsRecording(false)
          setIsTranscribing(false)
          setIsConverting(false)
        }
      }

      mediaRecorder.start(1000)
      setIsRecording(true)

      // Auto-stop after configured timeout
      recordingTimeoutRef.current = setTimeout(() => {
        stopRecording()
      }, CONSTANTS.RECORDING_TIMEOUT_MS)
    } catch (err) {
      toast({
        title: 'Recording Error',
        description:
          err instanceof Error
            ? err.message
            : 'Could not start recording. Please make sure you have granted microphone permissions.',
        variant: 'destructive',
        position: 'top-left',
      })
    }
  }, [sendAudioForTranscription, stopRecording, toast])

  // --- Drag and drop handlers (for welcome screen) ---
  // Check if drag contains any files that would be accepted
  const dragHasSupportedFiles = useCallback(
    (items: DataTransferItemList) => {
      const fileItems = Array.from(items).filter((item) => item.kind === 'file')
      if (fileItems.length === 0) return false

      // For non-premium users, check if there are any non-image files
      if (!isPremium) {
        return fileItems.some((item) => !item.type.startsWith('image/'))
      }
      return true
    },
    [isPremium],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Don't show drop indicator if no supported files
      if (
        e.dataTransfer.items &&
        !dragHasSupportedFiles(e.dataTransfer.items)
      ) {
        return
      }

      if (!isDragOver) {
        setIsDragOver(true)
      }
    },
    [isDragOver, dragHasSupportedFiles],
  )

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Don't show drop indicator if no supported files
      if (
        e.dataTransfer.items &&
        !dragHasSupportedFiles(e.dataTransfer.items)
      ) {
        return
      }

      setIsDragOver(true)
    },
    [dragHasSupportedFiles],
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set to false if we're leaving the input container completely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const files = e.dataTransfer.files
      if (files && files.length > 0 && handleDocumentUpload) {
        const file = files[0]
        if (!isPremium && isImageFile(file)) {
          toast({
            title: 'Premium Feature',
            description: 'Image uploads are only available with Premium.',
            position: 'top-left',
          })
          return
        }
        handleDocumentUpload(file)
      }
    },
    [handleDocumentUpload, isPremium, toast],
  )

  // Handle paste event for long text detection
  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const pastedText = e.clipboardData.getData('text')

      // Check if pasted text exceeds threshold
      if (
        pastedText.length > CONSTANTS.LONG_PASTE_THRESHOLD &&
        handleDocumentUpload
      ) {
        e.preventDefault() // Prevent the text from being pasted into the textarea

        // Create a .txt file from the pasted text
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, '-')
          .slice(0, -5)
        const fileName = `pasted-text-${timestamp}.txt`
        const file = new File([pastedText], fileName, { type: 'text/plain' })

        // Upload the file through the existing document upload system
        handleDocumentUpload(file).catch((error) => {
          logError('Failed to upload pasted text as document', error, {
            component: 'ChatInput',
            action: 'handlePaste',
            metadata: {
              textLength: pastedText.length,
              fileName,
            },
          })
        })
      }
      // If text is short enough, let it paste normally (default behavior)
    },
    [handleDocumentUpload],
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        {/* Project tab - manila folder style, absolutely positioned */}
        {isProjectMode && activeProject && (
          <div className="pointer-events-none absolute right-8 top-px z-10 -translate-y-full">
            <div className="pointer-events-auto inline-flex items-center gap-1.5 rounded-t-lg border border-b-0 border-border-subtle bg-surface-chat px-2.5 py-1">
              <FolderIcon className="h-3 w-3 text-content-secondary" />
              <span className="text-xs font-medium text-content-secondary">
                {activeProject.name}
              </span>
            </div>
          </div>
        )}
        <div
          className={cn(
            'rounded-3xl border border-border-subtle bg-surface-chat px-3 py-3 shadow-md transition-colors md:rounded-4xl md:px-6 md:py-4',
            isDragOver && 'ring-2 ring-emerald-400/60',
          )}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            multiple
            accept={
              isPremium
                ? '.pdf,.docx,.xlsx,.pptx,.md,.html,.xhtml,.csv,.png,.jpg,.jpeg,.tiff,.bmp,.webp,.txt'
                : '.pdf,.docx,.xlsx,.pptx,.md,.html,.xhtml,.csv,.txt'
            }
          />

          {processedDocuments && processedDocuments.length > 0 && (
            <div
              ref={documentsScrollRef}
              className="-mx-3 mb-3 flex gap-2 overflow-x-auto px-3 pt-2 md:-mx-6 md:px-6"
            >
              {processedDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="group relative flex min-w-[200px] max-w-[300px] flex-shrink-0 flex-col rounded-2xl border border-border-subtle bg-surface-chat-background p-3 shadow-sm transition-colors"
                >
                  {removeDocument && !doc.isUploading && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeDocument(doc.id)
                      }}
                      className={cn(
                        'absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full border-[0.5px] border-white',
                        'bg-surface-chat text-content-secondary shadow-sm hover:bg-surface-chat-background hover:text-content-primary',
                      )}
                      aria-label="Remove document"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-3 w-3"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    {doc.imageData ? (
                      <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-md border border-border-subtle bg-surface-card">
                        <img
                          src={`data:${doc.imageData.mimeType};base64,${doc.imageData.base64}`}
                          alt={doc.name}
                          className="h-full w-full object-cover"
                        />
                        {doc.isUploading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-surface-chat/70">
                            <PiSpinner className="h-3.5 w-3.5 animate-spin text-content-primary" />
                          </div>
                        )}
                      </div>
                    ) : doc.isUploading ? (
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center">
                        <PiSpinner className="h-5 w-5 animate-spin text-content-secondary" />
                      </div>
                    ) : (
                      <MacFileIcon
                        filename={doc.name}
                        size={18}
                        isDarkMode={isDarkMode}
                        compact
                      />
                    )}
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium text-content-primary">
                        {doc.name}
                      </span>
                      {!doc.isUploading && (
                        <span className="text-xs text-content-muted">
                          {doc.imageData ? 'Image' : 'Document'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <textarea
            id="chat-input"
            ref={inputRef}
            value={input}
            autoFocus
            onFocus={handleInputFocus}
            onChange={(e) => {
              setInput(e.target.value)
              e.target.style.height = '0px'
              e.target.style.height = `${Math.max(parseInt(inputMinHeight), Math.min(e.target.scrollHeight, 240))}px`
            }}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                const textarea = e.currentTarget
                const cursorPosition = textarea.selectionStart
                const textBeforeCursor = input.slice(0, cursorPosition)
                const lastLineStart = textBeforeCursor.lastIndexOf('\n') + 1
                const currentLine = textBeforeCursor.slice(lastLineStart)

                // Check if we're on a list line
                const listMatch = currentLine.match(
                  /^(\s*)(\s*\u2022\s+|[-*+]|\s*\d+\.)\s+(?!\[[ x]\])/,
                )

                if (listMatch) {
                  e.preventDefault()
                  const textAfterCursor = input.slice(cursorPosition)

                  if (e.shiftKey) {
                    // Shift+Tab: decrease indent (remove 4 spaces or exit list)
                    const dedentMatch = currentLine.match(/^    /)
                    if (dedentMatch) {
                      // Has 4+ spaces, remove 4 spaces
                      const newText =
                        input.slice(0, lastLineStart) +
                        currentLine.slice(4) +
                        textAfterCursor

                      setInput(newText)

                      setTimeout(() => {
                        textarea.selectionStart = textarea.selectionEnd =
                          Math.max(lastLineStart, cursorPosition - 4)
                      }, 0)
                    } else {
                      // Single indent level - remove the bullet/marker entirely
                      const contentMatch = currentLine.match(
                        /^(\s*)(\s*\u2022\s+|[-*+]|\s*\d+\.)\s+(.*)$/,
                      )
                      if (contentMatch) {
                        const [, , , content] = contentMatch
                        const newText =
                          input.slice(0, lastLineStart) +
                          content +
                          textAfterCursor

                        setInput(newText)

                        setTimeout(() => {
                          textarea.selectionStart = textarea.selectionEnd =
                            lastLineStart + content.length
                        }, 0)
                      }
                    }
                  } else {
                    // Tab: increase indent (add 4 spaces)
                    const newText =
                      input.slice(0, lastLineStart) +
                      '    ' +
                      currentLine +
                      textAfterCursor

                    setInput(newText)

                    setTimeout(() => {
                      textarea.selectionStart = textarea.selectionEnd =
                        cursorPosition + 4
                    }, 0)
                  }
                }
              } else if (e.key === ' ') {
                const textarea = e.currentTarget
                const cursorPosition = textarea.selectionStart
                const textBeforeCursor = input.slice(0, cursorPosition)
                const lastLineStart = textBeforeCursor.lastIndexOf('\n') + 1
                const currentLine = textBeforeCursor.slice(lastLineStart)

                // Check if the line starts with * or - or + (for bullets)
                const bulletMatch = currentLine.match(/^(\s*)([-*+])$/)

                if (bulletMatch) {
                  e.preventDefault()
                  const [, indent] = bulletMatch
                  const textAfterCursor = input.slice(cursorPosition)

                  // Replace the marker with a bullet point and add space with indentation
                  // Extra space after bullet to align with numbered lists
                  const newText =
                    input.slice(0, lastLineStart) +
                    indent +
                    '  \u2022  ' +
                    textAfterCursor

                  setInput(newText)

                  setTimeout(() => {
                    textarea.selectionStart = textarea.selectionEnd =
                      lastLineStart + indent.length + 5
                  }, 0)
                } else {
                  // Check if the line starts with a number (for numbered lists)
                  const numberMatch = currentLine.match(/^(\s*)(\d+\.)$/)

                  if (numberMatch) {
                    e.preventDefault()
                    const [, indent, marker] = numberMatch
                    const textAfterCursor = input.slice(cursorPosition)

                    // Just add a space after the number marker (no extra indentation)
                    const newText =
                      input.slice(0, lastLineStart) +
                      indent +
                      marker +
                      ' ' +
                      textAfterCursor

                    setInput(newText)

                    setTimeout(() => {
                      textarea.selectionStart = textarea.selectionEnd =
                        lastLineStart + indent.length + marker.length + 1
                    }, 0)
                  }
                }
              } else if (e.key === 'Enter' && !e.shiftKey) {
                // On mobile, Enter should insert a newline, not submit
                const isMobile = /iPhone|iPad|iPod|Android/i.test(
                  navigator.userAgent,
                )
                if (isMobile) {
                  return
                }
                e.preventDefault()
                const hasDocuments =
                  processedDocuments &&
                  processedDocuments.some((doc) => !doc.isUploading)
                const hasInput = input.trim().length > 0
                if (
                  loadingState === 'idle' &&
                  !isTranscribing &&
                  !isConverting &&
                  (hasInput || hasDocuments)
                ) {
                  handleSubmit(e)
                }
              } else if (e.key === 'Enter' && e.shiftKey) {
                const textarea = e.currentTarget
                const cursorPosition = textarea.selectionStart
                const textBeforeCursor = input.slice(0, cursorPosition)
                const lastLineStart = textBeforeCursor.lastIndexOf('\n') + 1
                const currentLine = textBeforeCursor.slice(lastLineStart)

                // Match list markers: •, -, *, +, 1.
                const listMarkerMatch = currentLine.match(
                  /^(\s*)(\s*\u2022\s+|[-*+]|\s*\d+\.)\s+/,
                )

                if (!listMarkerMatch) {
                  setTimeout(() => {
                    textarea.style.height = inputMinHeight
                    textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`
                    textarea.scrollTop = textarea.scrollHeight
                  }, 0)
                } else {
                  e.preventDefault()
                  const [fullMatch, indent, marker] = listMarkerMatch

                  const contentAfterMarker = currentLine
                    .slice(fullMatch.length)
                    .trim()

                  if (!contentAfterMarker) {
                    // Empty list item - exit the list
                    const textAfterCursor = input.slice(cursorPosition)
                    const newText =
                      input.slice(0, lastLineStart) + indent + textAfterCursor

                    setInput(newText)

                    setTimeout(() => {
                      textarea.selectionStart = textarea.selectionEnd =
                        lastLineStart + indent.length
                    }, 0)
                  } else {
                    // Continue the list
                    const textAfterCursor = input.slice(cursorPosition)
                    let newMarker = marker

                    // Increment numbered lists (handle with or without leading spaces)
                    const numberMatch = marker.match(/^(\s*)(\d+\.)$/)
                    if (numberMatch) {
                      const [, markerIndent, number] = numberMatch
                      const currentNumber = parseInt(number)
                      newMarker = `${markerIndent}${currentNumber + 1}.`
                    }

                    const newText =
                      textBeforeCursor +
                      '\n' +
                      indent +
                      newMarker +
                      ' ' +
                      textAfterCursor

                    setInput(newText)

                    const newCursorPos =
                      cursorPosition + 1 + indent.length + newMarker.length + 1

                    setTimeout(() => {
                      textarea.style.height = inputMinHeight
                      textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`
                      textarea.selectionStart = textarea.selectionEnd =
                        newCursorPos
                      textarea.scrollTop = textarea.scrollHeight
                    }, 0)
                  }
                }
              } else if (e.key === 'Escape' && loadingState === 'loading') {
                e.preventDefault()
                cancelGeneration()
              }
            }}
            placeholder={hasMessages ? 'Reply to Tin...' : placeholder}
            rows={1}
            className="min-h-[36px] w-full resize-none overflow-y-auto bg-transparent text-lg leading-relaxed text-content-primary placeholder:text-content-muted focus:outline-none md:min-h-0"
            style={{
              minHeight: inputMinHeight,
              maxHeight: '240px',
            }}
          />

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-1">
              {/* Mobile: + button with dropdown menu */}
              <div className="relative md:hidden">
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  aria-label="Attachment options"
                  aria-expanded={isMobileMenuOpen}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-content-secondary transition-colors hover:bg-surface-chat-background hover:text-content-primary"
                >
                  <PiPlusLight className="h-5 w-5" />
                </button>
                {isMobileMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsMobileMenuOpen(false)}
                    />
                    <div className="absolute bottom-full left-0 z-20 mb-2 min-w-[180px] rounded-xl border border-border-subtle bg-surface-chat py-1.5 shadow-lg">
                      <button
                        type="button"
                        onClick={() => {
                          triggerFileInput()
                          setIsMobileMenuOpen(false)
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-content-primary hover:bg-surface-chat-background"
                      >
                        <PiPaperclipLight className="h-5 w-5 text-content-secondary" />
                        Add files or photos
                      </button>
                      {onWebSearchToggle && (
                        <button
                          type="button"
                          onClick={() => {
                            onWebSearchToggle()
                            setIsMobileMenuOpen(false)
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-content-primary hover:bg-surface-chat-background"
                        >
                          <PiGlobe className="h-5 w-5 text-content-secondary" />
                          <span className="flex-1">Web search</span>
                          {webSearchEnabled && (
                            <svg
                              className="h-4 w-4 text-brand-accent-light"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Desktop: Original buttons */}
              <div className="group relative hidden md:block">
                <button
                  id="upload-button"
                  type="button"
                  onClick={triggerFileInput}
                  aria-label="Upload document"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-content-secondary transition-colors hover:bg-surface-chat-background hover:text-content-primary"
                >
                  <PiPaperclipLight className="h-5 w-5" />
                </button>
                <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-border-subtle bg-surface-chat-background px-2 py-1 text-xs text-content-primary opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                  Upload document
                </span>
              </div>
              {onWebSearchToggle && (
                <div className="group relative hidden md:block">
                  <button
                    id="web-search-button"
                    type="button"
                    onClick={onWebSearchToggle}
                    aria-label="Web search"
                    aria-pressed={webSearchEnabled}
                    className={cn(
                      'flex h-7 items-center justify-center gap-1.5 rounded-lg transition-colors',
                      webSearchEnabled
                        ? cn(
                            'px-2',
                            isDarkMode
                              ? 'bg-brand-accent-light/20 text-brand-accent-light'
                              : 'bg-brand-accent-dark/20 text-brand-accent-dark',
                          )
                        : 'w-7 text-content-secondary hover:bg-surface-chat-background hover:text-content-primary',
                    )}
                  >
                    {webSearchEnabled ? (
                      <PiGlobe className="h-5 w-5" />
                    ) : (
                      <PiGlobeX className="h-5 w-5" />
                    )}
                    {webSearchEnabled && (
                      <span className="text-xs font-medium leading-none">
                        Web Search
                      </span>
                    )}
                  </button>
                  {!webSearchEnabled && (
                    <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-border-subtle bg-surface-chat-background px-2 py-1 text-xs text-content-primary opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                      Web search
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {modelSelectorButton && <div>{modelSelectorButton}</div>}
              {isPremium && audioModel && (
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  className={cn(
                    'rounded-lg p-1.5 disabled:opacity-50',
                    isRecording
                      ? 'animate-pulse text-red-500'
                      : 'text-content-secondary transition-colors hover:bg-surface-chat-background hover:text-content-primary',
                  )}
                  title={
                    isRecording
                      ? 'Stop recording'
                      : isConverting
                        ? 'Converting to WAV...'
                        : 'Start recording'
                  }
                  disabled={isTranscribing || isConverting}
                >
                  {isRecording ? (
                    <StopIcon className="h-5 w-5" />
                  ) : isTranscribing || isConverting ? (
                    <PiSpinner className="h-5 w-5 animate-spin text-current" />
                  ) : (
                    <MicrophoneIcon className="h-5 w-5" />
                  )}
                </button>
              )}
              <button
                id="send-button"
                type="button"
                onClick={(e) => {
                  if (
                    loadingState === 'loading' ||
                    loadingState === 'retrying'
                  ) {
                    e.preventDefault()
                    cancelGeneration()
                  } else {
                    handleSubmit(e)
                  }
                }}
                className="group flex h-10 w-10 items-center justify-center rounded-full bg-button-send-background text-button-send-foreground transition-colors hover:bg-button-send-background/80 disabled:opacity-50 md:h-6 md:w-6"
                disabled={
                  loadingState !== 'loading' &&
                  loadingState !== 'retrying' &&
                  (isTranscribing || isConverting)
                }
              >
                {loadingState === 'loading' || loadingState === 'retrying' ? (
                  <div className="h-3.5 w-3.5 bg-button-send-foreground/80 transition-colors md:h-2.5 md:w-2.5" />
                ) : (
                  <FiArrowUp className="h-6 w-6 text-button-send-foreground transition-colors md:h-4 md:w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {hasMessages && (
        <div className="text-center">
          <p className="text-xs text-content-muted">
            AI can make mistakes. Verify important information.
          </p>
        </div>
      )}
    </div>
  )
}
