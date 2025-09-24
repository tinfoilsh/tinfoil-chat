/* eslint-disable react/no-unescaped-entities */

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
  FiArrowUp,
} from '@/components/icons/lazy-icons'
import { cn } from '@/components/ui/utils'
import { useApiKey } from '@/hooks/use-api-key'
import { useToast } from '@/hooks/use-toast'
import { ehbpRequest } from '@/utils/ehbp-client'
import { logError } from '@/utils/error-handling'
import { convertWebMToWAV, isWebMAudioSupported } from '@/utils/preprocessing'
import {
  DocumentIcon,
  MicrophoneIcon,
  StopIcon,
} from '@heroicons/react/24/outline'
import type { FormEvent, RefObject } from 'react'
import { useCallback, useRef, useState } from 'react'
import { CONSTANTS } from './constants'
import { getFileIconType } from './document-uploader'
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
}

// Component for Mac-style file icons
const MacFileIcon = ({
  filename,
  size = 20,
  isDarkMode = false,
  isUploading = false,
  compact = false,
}: {
  filename: string
  size?: number
  isDarkMode?: boolean
  isUploading?: boolean
  compact?: boolean
}) => {
  const type = getFileIconType(filename)

  // Get spinner size based on file icon size - using proper Tailwind classes
  const getSpinnerClasses = (iconSize: number) => {
    if (iconSize <= 16) return 'h-4 w-4'
    if (iconSize <= 24) return 'h-5 w-5'
    if (iconSize <= 32) return 'h-6 w-6'
    return 'h-8 w-8'
  }

  // If uploading, show spinner instead of file icon
  if (isUploading) {
    return (
      <div className="flex flex-col items-center">
        <div className="flex items-center justify-center rounded-md bg-surface-card/80 p-1 shadow-sm">
          <svg
            className={`${getSpinnerClasses(size)} animate-spin text-emerald-500`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        </div>
      </div>
    )
  }

  // Get appropriate icon based on file type
  let FileIcon = FaFile
  let bgColorLight = 'bg-surface-card'
  let bgColorDark = 'bg-surface-chat/60'
  let iconColor = 'text-content-secondary'

  switch (type) {
    case 'pdf':
      FileIcon = FaFilePdf
      bgColorLight = 'bg-red-50'
      bgColorDark = 'bg-red-900/20'
      iconColor = 'text-red-500'
      break
    case 'docx':
      FileIcon = FaFileWord
      bgColorLight = 'bg-blue-50'
      bgColorDark = 'bg-blue-900/20'
      iconColor = 'text-blue-500'
      break
    case 'xlsx':
    case 'csv':
      FileIcon = FaFileExcel
      bgColorLight = 'bg-green-50'
      bgColorDark = 'bg-green-900/20'
      iconColor = 'text-green-500'
      break
    case 'pptx':
      FileIcon = FaFilePowerpoint
      bgColorLight = 'bg-orange-50'
      bgColorDark = 'bg-orange-900/20'
      iconColor = 'text-orange-500'
      break
    case 'image':
      FileIcon = FaFileImage
      bgColorLight = 'bg-indigo-50'
      bgColorDark = 'bg-indigo-900/20'
      iconColor = 'text-indigo-500'
      break
    case 'audio':
      FileIcon = FaFileAudio
      bgColorLight = 'bg-purple-50'
      bgColorDark = 'bg-purple-900/20'
      iconColor = 'text-purple-500'
      break
    case 'video':
      FileIcon = FaFileVideo
      bgColorLight = 'bg-yellow-50'
      bgColorDark = 'bg-yellow-900/20'
      iconColor = 'text-yellow-500'
      break
    case 'zip':
      FileIcon = FaFileArchive
      bgColorLight = 'bg-amber-50'
      bgColorDark = 'bg-amber-900/20'
      iconColor = 'text-amber-500'
      break
    case 'html':
    case 'js':
    case 'ts':
    case 'css':
      FileIcon = FaFileCode
      bgColorLight = 'bg-cyan-50'
      bgColorDark = 'bg-cyan-900/20'
      iconColor = 'text-cyan-500'
      break
    case 'txt':
      FileIcon = FaFileAlt
      bgColorLight = 'bg-slate-50'
      bgColorDark = 'bg-slate-700/30'
      iconColor = 'text-slate-500'
      break
    case 'md':
      FileIcon = FaFileAlt
      bgColorLight = 'bg-emerald-50'
      bgColorDark = 'bg-emerald-900/20'
      iconColor = 'text-emerald-500'
      break
    default:
      FileIcon = FaFile
      bgColorLight = 'bg-surface-card'
      bgColorDark = 'bg-surface-chat/60'
      iconColor = 'text-content-secondary'
  }

  const bgColor = isDarkMode ? bgColorDark : bgColorLight

  const iconElement = (
    <div
      className={`flex items-center justify-center rounded-md ${
        compact ? '' : 'p-1 shadow-sm'
      } ${bgColor}`}
    >
      <FileIcon className={iconColor} style={{ fontSize: size }} />
    </div>
  )

  if (compact) {
    return iconElement
  }

  return <div className="flex flex-col items-center">{iconElement}</div>
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
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  // Use the abstracted API key hook
  const { getApiKey } = useApiKey()

  // --- Speech-to-text state ---
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- Drag and drop state (for welcome screen when no parent drag area exists) ---
  const [isDragOver, setIsDragOver] = useState(false)

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0 && handleDocumentUpload) {
        handleDocumentUpload(e.target.files[0])
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    },
    [handleDocumentUpload],
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

        const formData = new FormData()
        formData.append('file', blob, 'audio.wav')
        formData.append('model', 'whisper-large-v3-turbo')
        formData.append('response_format', 'text')

        // Get the API key (will use cached value if available)
        const apiKey = await getApiKey()
        if (!apiKey) {
          throw new Error('No API key available for transcription')
        }

        // Use the proxy with the audio transcription endpoint
        const proxyUrl = `${CONSTANTS.INFERENCE_PROXY_URL}/v1/audio/transcriptions`

        const response = await ehbpRequest(proxyUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: formData,
        })

        if (!response.ok) {
          throw new Error(
            `Transcription failed: ${response.status} ${response.statusText}`,
          )
        }

        const data = await response.json()
        const text = data.text || data.transcription || ''

        if (text) {
          const currentInput = input.trim()
          const newText = text.trim()

          if (currentInput) {
            // There's existing text, append the new transcription
            setInput(currentInput + ' ' + newText)
          } else {
            // No existing text, set the transcription
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
    [setInput, toast, getApiKey, input],
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
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!isDragOver) {
        setIsDragOver(true)
      }
    },
    [isDragOver],
  )

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

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
        handleDocumentUpload(files[0])
      }
    },
    [handleDocumentUpload],
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
      <div
        className={cn(
          'rounded-2xl border border-border-subtle bg-surface-chat p-4 shadow-lg transition-colors',
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
          accept=".pdf,.docx,.xlsx,.pptx,.md,.html,.xhtml,.csv,.png,.jpg,.jpeg,.tiff,.bmp,.webp,.txt"
        />

        {processedDocuments && processedDocuments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {processedDocuments.map((doc) => (
              <div
                key={doc.id}
                className="group relative flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-chat px-2.5 py-1.5 text-content-primary shadow-sm transition-colors hover:bg-surface-chat/80"
                title={doc.name}
              >
                <div className="relative">
                  {doc.imageData ? (
                    <div className="relative h-9 w-9 overflow-hidden rounded-md border border-border-subtle bg-surface-card">
                      <img
                        src={`data:${doc.imageData.mimeType};base64,${doc.imageData.base64}`}
                        alt={doc.name}
                        className="h-full w-full object-cover"
                      />
                      {doc.isUploading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-surface-chat/70">
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-content-primary border-t-transparent" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <MacFileIcon
                      filename={doc.name}
                      size={18}
                      isDarkMode={isDarkMode}
                      isUploading={doc.isUploading}
                      compact
                    />
                  )}
                  {removeDocument && !doc.isUploading && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeDocument(doc.id)
                      }}
                      className={cn(
                        'absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100',
                        'bg-surface-chat-background/90 text-content-secondary hover:bg-surface-chat-background hover:text-content-primary',
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
                </div>
                <span className="max-w-[180px] truncate text-xs text-content-primary">
                  {doc.name}
                </span>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={inputRef}
          value={input}
          autoFocus
          onFocus={handleInputFocus}
          onChange={(e) => {
            setInput(e.target.value)
            e.target.style.height = inputMinHeight
            e.target.style.height = `${Math.min(e.target.scrollHeight, 240)}px`
          }}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              console.log('[ChatInput] Enter pressed', {
                loadingState,
                inputLength: input.length,
              })
              if (loadingState === 'idle') {
                handleSubmit(e)
              }
            }
          }}
          placeholder={hasMessages ? 'Reply to Tin...' : "What's on your mind?"}
          rows={1}
          className="w-full resize-none overflow-y-auto bg-transparent text-base leading-relaxed text-content-primary placeholder:text-content-muted focus:outline-none"
          style={{
            minHeight: '28px',
            maxHeight: '240px',
          }}
        />

        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={triggerFileInput}
            className="rounded-lg p-1.5 text-content-secondary transition-colors hover:bg-surface-chat-background hover:text-content-primary"
            title="Upload document"
          >
            <DocumentIcon className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2">
            {isPremium && (
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
                  <svg
                    className="h-5 w-5 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                ) : (
                  <MicrophoneIcon className="h-5 w-5" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                console.log('[ChatInput] send button clicked', {
                  loadingState,
                  isTranscribing,
                  isConverting,
                  inputLength: input.length,
                })
                if (loadingState === 'loading') {
                  e.preventDefault()
                  cancelGeneration()
                } else {
                  handleSubmit(e)
                }
              }}
              className="group flex h-6 w-6 items-center justify-center rounded-full bg-button-send-background text-button-send-foreground transition-colors hover:bg-button-send-background/80 disabled:opacity-50"
              disabled={
                loadingState !== 'loading' && (isTranscribing || isConverting)
              }
            >
              {loadingState === 'loading' ? (
                <div className="h-2.5 w-2.5 bg-button-send-foreground/80 transition-colors" />
              ) : (
                <FiArrowUp className="h-4 w-4 text-button-send-foreground transition-colors" />
              )}
            </button>
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
