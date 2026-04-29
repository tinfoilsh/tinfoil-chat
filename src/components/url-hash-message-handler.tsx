import { base64ToUint8Array } from '@/utils/binary-codec'
import { logError, logInfo, logWarning } from '@/utils/error-handling'
import { useEffect, useRef } from 'react'

interface UrlHashMessageHandlerProps {
  onMessageReady: (message: string) => void
  isReady: boolean
}

const MAX_MESSAGE_LENGTH = 50000
const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/

function sanitizeMessage(decodedMessage: string): string | null {
  if (!decodedMessage) {
    return null
  }

  if (decodedMessage.length > MAX_MESSAGE_LENGTH) {
    logWarning('URL message exceeds maximum length', {
      component: 'UrlHashMessageHandler',
      metadata: {
        messageLength: decodedMessage.length,
        maxLength: MAX_MESSAGE_LENGTH,
      },
    })
    return null
  }

  if (CONTROL_CHARS_REGEX.test(decodedMessage)) {
    logWarning('URL message contains invalid control characters', {
      component: 'UrlHashMessageHandler',
    })
    return null
  }

  // Normalize smart quotes to regular quotes for better compatibility
  return decodedMessage
    .replace(/[\u201C\u201D]/g, '"') // Replace " and "
    .replace(/[\u2018\u2019]/g, "'") // Replace ' and '
}

/**
 * Handles two URL formats for prefilling a message:
 * 1. URL fragment: #send=<base64-encoded-message> (e.g., #send=V2hhdCBpcyAyKzI/)
 * 2. Query string: ?q=<url-encoded-message> (e.g., ?q=hello+world)
 *
 * The hash format distinguishes message sending from other fragment uses
 * like #settings/<tab>. The query format mirrors the convention used by
 * other chat tools (e.g., ChatGPT's ?q=).
 */
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

        if (!hash || hash.length <= 1 || !hash.startsWith('#send=')) {
          return false
        }

        const encodedMessage = hash.slice(6)

        try {
          // Decode base64 to binary, then interpret as UTF-8
          const bytes = base64ToUint8Array(encodedMessage)
          const decodedMessage = new TextDecoder('utf-8').decode(bytes)

          const normalizedMessage = sanitizeMessage(decodedMessage)
          if (!normalizedMessage) {
            return false
          }

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
          return true
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
          return false
        }
      } catch (error) {
        logError('Failed to process URL hash message', error, {
          component: 'UrlHashMessageHandler',
        })
        return false
      }
    }

    const processQueryMessage = () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const rawMessage = params.get('q')

        if (!rawMessage) {
          return false
        }

        const normalizedMessage = sanitizeMessage(rawMessage)
        if (!normalizedMessage) {
          return false
        }

        logInfo('Processing message from URL query', {
          component: 'UrlHashMessageHandler',
          metadata: { messageLength: normalizedMessage.length },
        })

        hasProcessed.current = true
        onMessageReady(normalizedMessage)

        params.delete('q')
        const remainingQuery = params.toString()
        const newUrl =
          window.location.pathname +
          (remainingQuery ? `?${remainingQuery}` : '') +
          window.location.hash
        window.history.replaceState(null, '', newUrl)
        return true
      } catch (error) {
        logError('Failed to process URL query message', error, {
          component: 'UrlHashMessageHandler',
        })
        return false
      }
    }

    if (!processHashMessage()) {
      processQueryMessage()
    }
  }, [isReady, onMessageReady])

  return null
}
