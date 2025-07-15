/* eslint-disable react/no-unescaped-entities */

import { useApiKey } from '@/hooks/use-api-key'
import { useToast } from '@/hooks/use-toast'
import { convertWebMToWAV, isWebMAudioSupported } from '@/utils/preprocessing'
import {
  DocumentIcon,
  MicrophoneIcon,
  PaperAirplaneIcon,
  StopIcon,
} from '@heroicons/react/24/outline'
import type { FormEvent, RefObject } from 'react'
import { useCallback, useRef, useState } from 'react'
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
import { CONSTANTS } from './constants'
import { getFileIconType } from './document-uploader'
import type { LoadingState } from './types'

// Add type for processed documents
type ProcessedDocument = {
  id: string
  name: string
  time: Date
  content?: string
  isUploading?: boolean
}

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
}

// Component for Mac-style file icons
const MacFileIcon = ({
  filename,
  size = 20,
  isDarkMode = false,
  isUploading = false,
}: {
  filename: string
  size?: number
  isDarkMode?: boolean
  isUploading?: boolean
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
        <div
          className={`flex items-center justify-center rounded-md p-1 ${
            isDarkMode ? 'bg-gray-800/40' : 'bg-gray-100'
          } shadow-sm`}
        >
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
  let bgColorLight = 'bg-gray-100'
  let bgColorDark = 'bg-gray-800/40'
  let iconColor = 'text-gray-500'

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
      bgColorLight = 'bg-gray-50'
      bgColorDark = 'bg-gray-700/30'
      iconColor = 'text-gray-500'
  }

  const bgColor = isDarkMode ? bgColorDark : bgColorLight

  return (
    <div className="flex flex-col items-center">
      <div
        className={`flex items-center justify-center rounded-md p-1 ${bgColor} shadow-sm`}
      >
        <FileIcon className={`${iconColor}`} style={{ fontSize: size }} />
      </div>
    </div>
  )
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

        const response = await fetch(proxyUrl, {
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
  }, [sendAudioForTranscription, stopRecording, toast, convertWebMToWAV])

  return (
    <div className="flex flex-col gap-2">
      {/* Display processed documents above input area */}
      {processedDocuments && processedDocuments.length > 0 && (
        <div
          className={`mb-2 flex items-center gap-2 overflow-x-auto rounded-lg px-2 py-2 ${
            isDarkMode
              ? 'border border-gray-600 bg-gray-700/40'
              : 'border border-gray-200 bg-gray-100/70'
          }`}
        >
          {processedDocuments.map((doc) => (
            <div
              key={doc.id}
              className="group relative flex flex-col items-center px-2 py-1.5"
              title={doc.name}
            >
              <div className="relative">
                <MacFileIcon
                  filename={doc.name}
                  size={20}
                  isDarkMode={isDarkMode}
                  isUploading={doc.isUploading}
                />
                {removeDocument && !doc.isUploading && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeDocument(doc.id)
                    }}
                    className={`absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 ${
                      isDarkMode
                        ? 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                        : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
                    }`}
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
              <span
                className={`mt-1 max-w-[60px] truncate text-xs ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-600'
                }`}
              >
                {doc.name.length > 10
                  ? doc.name.substring(0, 8) + '...'
                  : doc.name}
              </span>
            </div>
          ))}
        </div>
      )}

      <div
        className={`flex items-end gap-2 rounded-xl border py-2 pl-2 shadow-lg ${
          isDarkMode
            ? 'border-gray-600 bg-gray-700'
            : 'border-gray-300 bg-gray-100'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept=".pdf,.docx,.xlsx,.pptx,.md,.html,.xhtml,.csv,.png,.jpg,.jpeg,.tiff,.bmp,.webp,.txt"
        />
        <button
          type="button"
          onClick={triggerFileInput}
          className={`rounded-lg p-1.5 ${
            isDarkMode
              ? 'text-gray-300 hover:bg-gray-600'
              : 'text-gray-600 hover:bg-gray-200'
          }`}
          title="Upload document"
        >
          <DocumentIcon className="h-5 w-5" />
        </button>
        <div className="relative flex flex-1 self-center">
          <textarea
            ref={inputRef}
            value={input}
            onFocus={handleInputFocus}
            onChange={(e) => {
              setInput(e.target.value)
              e.target.style.height = inputMinHeight
              e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (loadingState === 'idle') {
                  handleSubmit(e)
                }
              }
            }}
            placeholder="Message Tin..."
            rows={1}
            className={`w-full resize-none overflow-y-auto bg-transparent px-2 text-base leading-normal placeholder-gray-400 focus:outline-none ${
              isDarkMode ? 'text-gray-100' : 'text-gray-900'
            } ${isPremium ? 'pr-20' : 'pr-10'}`}
            style={{
              minHeight: inputMinHeight,
              maxHeight: '200px',
            }}
          />
          <div className="absolute bottom-0 right-0 flex items-center">
            {isPremium && (
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                className={`mr-2 rounded-lg p-1.5 ${
                  isRecording
                    ? 'animate-pulse text-red-500'
                    : isDarkMode
                      ? 'text-gray-300 hover:bg-gray-600'
                      : 'text-gray-600 hover:bg-gray-200'
                } disabled:opacity-50`}
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
              type="submit"
              onClick={
                loadingState === 'loading' ? cancelGeneration : handleSubmit
              }
              className={`mr-2 rounded-lg p-1.5 ${
                isDarkMode
                  ? 'text-gray-300 hover:bg-gray-600'
                  : 'text-gray-600 hover:bg-gray-200'
              } disabled:opacity-50`}
              disabled={
                loadingState !== 'loading' && (isTranscribing || isConverting)
              }
            >
              {loadingState === 'loading' ? (
                <StopIcon className="h-5 w-5" />
              ) : (
                <PaperAirplaneIcon className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
