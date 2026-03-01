import { DEFAULT_TTS_VOICE } from '@/config/tts-voices'
import { getTinfoilClient } from '@/services/inference/tinfoil-client'
import { logError } from '@/utils/error-handling'
import { sanitizeTextForTTS } from '@/utils/tts-text-processing'
import { SpeakerWaveIcon, StopIcon } from '@heroicons/react/24/outline'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { PiSpinner } from 'react-icons/pi'

const PCM_SAMPLE_RATE = 24000

type TTSState = 'idle' | 'loading' | 'playing'

interface TTSButtonProps {
  content: string
  model: string
  voice?: string
}

export const TTSButton = memo(function TTSButton({
  content,
  model,
  voice,
}: TTSButtonProps) {
  const [state, setState] = useState<TTSState>('idle')
  const abortControllerRef = useRef<AbortController | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const nextStartTimeRef = useRef(0)

  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    nextStartTimeRef.current = 0
  }, [])

  useEffect(() => {
    return cleanup
  }, [cleanup])

  const scheduleChunk = useCallback(
    (pcmData: Int16Array, audioContext: AudioContext) => {
      const floatData = new Float32Array(pcmData.length)
      for (let i = 0; i < pcmData.length; i++) {
        floatData[i] = pcmData[i] / 32768
      }

      const buffer = audioContext.createBuffer(
        1,
        floatData.length,
        PCM_SAMPLE_RATE,
      )
      buffer.getChannelData(0).set(floatData)

      const source = audioContext.createBufferSource()
      source.buffer = buffer
      source.connect(audioContext.destination)

      const now = audioContext.currentTime
      const startTime = Math.max(nextStartTimeRef.current, now)
      source.start(startTime)
      nextStartTimeRef.current = startTime + buffer.duration
    },
    [],
  )

  const handleClick = useCallback(async () => {
    if (state === 'loading' || state === 'playing') {
      cleanup()
      setState('idle')
      return
    }

    setState('loading')

    try {
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      const client = await getTinfoilClient()
      const response = await client.audio.speech.create(
        {
          model,
          voice: voice ?? DEFAULT_TTS_VOICE,
          input: sanitizeTextForTTS(content),
          response_format: 'pcm',
          stream: true,
        } as Parameters<typeof client.audio.speech.create>[0] & {
          stream: boolean
        },
        { signal: abortController.signal },
      )

      if (abortController.signal.aborted) return

      const body = (response as unknown as Response).body
      if (!body) {
        cleanup()
        setState('idle')
        return
      }

      const audioContext = new AudioContext({ sampleRate: PCM_SAMPLE_RATE })
      audioContextRef.current = audioContext
      nextStartTimeRef.current = 0

      setState('playing')

      const reader = body.getReader()
      let leftover = new Uint8Array(0)

      while (true) {
        if (abortController.signal.aborted) return

        const { done, value } = await reader.read()
        if (done) break

        // Combine leftover bytes with new chunk
        const combined = new Uint8Array(leftover.length + value.length)
        combined.set(leftover)
        combined.set(value, leftover.length)

        // PCM 16-bit = 2 bytes per sample, process only complete samples
        const usableBytes = combined.length - (combined.length % 2)
        if (usableBytes > 0) {
          const pcmData = new Int16Array(
            combined.buffer.slice(
              combined.byteOffset,
              combined.byteOffset + usableBytes,
            ),
          )
          scheduleChunk(pcmData, audioContext)
        }

        leftover = combined.slice(usableBytes)
      }

      // Wait for all scheduled audio to finish playing
      const remainingTime = nextStartTimeRef.current - audioContext.currentTime
      if (remainingTime > 0) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, remainingTime * 1000)
          abortController.signal.addEventListener('abort', () => {
            clearTimeout(timer)
            resolve()
          })
        })
      }

      if (!abortController.signal.aborted) {
        cleanup()
        setState('idle')
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return

      logError('Failed to generate speech', error, {
        component: 'TTSButton',
        action: 'generateSpeech',
      })
      cleanup()
      setState('idle')
    }
  }, [state, content, model, voice, cleanup, scheduleChunk])

  return (
    <div className="group/tts relative">
      <button
        type="button"
        onClick={handleClick}
        className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-all ${
          state === 'playing'
            ? 'text-blue-600 dark:text-blue-400'
            : 'text-content-secondary hover:bg-surface-chat-background hover:text-content-primary'
        }`}
        aria-label={
          state === 'loading'
            ? 'Generating speech...'
            : state === 'playing'
              ? 'Stop audio'
              : 'Read aloud'
        }
      >
        {state === 'loading' ? (
          <PiSpinner className="h-3.5 w-3.5 animate-spin" />
        ) : state === 'playing' ? (
          <StopIcon className="h-3.5 w-3.5" />
        ) : (
          <SpeakerWaveIcon className="h-3.5 w-3.5" />
        )}
      </button>
      {state === 'idle' && (
        <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-border-subtle bg-surface-chat-background px-2 py-1 text-xs text-content-primary opacity-0 shadow-sm transition-opacity group-hover/tts:opacity-100">
          Read aloud
        </span>
      )}
    </div>
  )
})
