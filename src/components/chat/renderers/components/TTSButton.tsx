import { DEFAULT_TTS_VOICE } from '@/config/tts-voices'
import { getTinfoilClient } from '@/services/inference/tinfoil-client'
import { logError } from '@/utils/error-handling'
import { SpeakerWaveIcon, StopIcon } from '@heroicons/react/24/outline'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { PiSpinner } from 'react-icons/pi'

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
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  useEffect(() => {
    return cleanup
  }, [cleanup])

  const handleClick = useCallback(async () => {
    if (state === 'loading') {
      cleanup()
      setState('idle')
      return
    }

    if (state === 'playing') {
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
          input: content,
          response_format: 'mp3',
        },
        { signal: abortController.signal },
      )

      if (abortController.signal.aborted) return

      const blob = await response.blob()
      if (abortController.signal.aborted) return

      const url = URL.createObjectURL(blob)
      objectUrlRef.current = url

      const audio = new Audio(url)
      audioRef.current = audio

      audio.addEventListener('ended', () => {
        cleanup()
        setState('idle')
      })

      audio.addEventListener('error', () => {
        cleanup()
        setState('idle')
      })

      await audio.play()
      setState('playing')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return

      logError('Failed to generate speech', error, {
        component: 'TTSButton',
        action: 'generateSpeech',
      })
      cleanup()
      setState('idle')
    }
  }, [state, content, model, voice, cleanup])

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
