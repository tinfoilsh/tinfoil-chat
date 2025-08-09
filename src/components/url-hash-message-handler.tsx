'use client'

import { logError, logInfo, logWarning } from '@/utils/error-handling'
import { useEffect, useRef } from 'react'

interface UrlHashMessageHandlerProps {
  onMessageReady: (message: string) => void
  isReady: boolean
}

export function UrlHashMessageHandler({
  onMessageReady,
  isReady,
}: UrlHashMessageHandlerProps) {
  const hasProcessed = useRef(false)

  useEffect(() => {
    if (!isReady || hasProcessed.current) {
      return
    }

    const processHashMessage = () => {
      try {
        const hash = window.location.hash

        if (!hash || hash.length <= 1) {
          return
        }

        const encodedMessage = hash.slice(1)

        try {
          const decodedMessage = atob(encodedMessage)

          if (decodedMessage) {
            logInfo('Processing message from URL hash', {
              component: 'UrlHashMessageHandler',
              metadata: { messageLength: decodedMessage.length },
            })

            hasProcessed.current = true

            onMessageReady(decodedMessage)

            window.history.replaceState(
              null,
              '',
              window.location.pathname + window.location.search,
            )
          }
        } catch (decodeError) {
          logWarning('Invalid base64 encoding in URL hash', {
            component: 'UrlHashMessageHandler',
            metadata: {
              error:
                decodeError instanceof Error
                  ? decodeError.message
                  : 'Unknown error',
            },
          })
        }
      } catch (error) {
        logError('Failed to process URL hash message', error, {
          component: 'UrlHashMessageHandler',
        })
      }
    }

    processHashMessage()
  }, [isReady, onMessageReady])

  return null
}
