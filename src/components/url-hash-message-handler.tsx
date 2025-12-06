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
          // Decode base64 to binary string (Latin-1)
          const binaryString = atob(encodedMessage)

          // Convert binary string to UTF-8
          const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0))
          const decodedMessage = new TextDecoder('utf-8').decode(bytes)

          if (!decodedMessage) {
            return
          }

          const maxMessageLength = 50000
          if (decodedMessage.length > maxMessageLength) {
            logWarning('URL hash message exceeds maximum length', {
              component: 'UrlHashMessageHandler',
              metadata: {
                messageLength: decodedMessage.length,
                maxLength: maxMessageLength,
              },
            })
            return
          }

          const hasControlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(
            decodedMessage,
          )
          if (hasControlChars) {
            logWarning('URL hash message contains invalid control characters', {
              component: 'UrlHashMessageHandler',
            })
            return
          }

          // Normalize smart quotes to regular quotes for better compatibility
          const normalizedMessage = decodedMessage
            .replace(/[\u201C\u201D]/g, '"') // Replace " and "
            .replace(/[\u2018\u2019]/g, "'") // Replace ' and '

          logInfo('Processing message from URL hash', {
            component: 'UrlHashMessageHandler',
            metadata: { messageLength: normalizedMessage.length },
          })

          hasProcessed.current = true
          onMessageReady(normalizedMessage)

          window.history.replaceState(
            null,
            '',
            window.location.pathname + window.location.search,
          )
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
