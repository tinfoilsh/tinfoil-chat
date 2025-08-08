'use client'

import { logError, logInfo } from '@/utils/error-handling'
import { useEffect } from 'react'

interface IframeMessage {
  type: string
  text?: string
  key?: string
}

export function IframeMessageHandler() {
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        // Parse the message
        const data = event.data as IframeMessage

        // Only handle text injection - no retrieval for security
        if (data.type === 'INJECT_TEXT') {
          if (data.text) {
            // Save to localStorage with optional key
            const storageKey = data.key || 'injected_text'
            localStorage.setItem(storageKey, data.text)

            // Send confirmation back to parent
            event.source?.postMessage(
              {
                type: 'TEXT_INJECTED',
                success: true,
                key: storageKey,
              },
              { targetOrigin: event.origin },
            )

            logInfo('Text injected via iframe', {
              component: 'IframeMessageHandler',
              key: storageKey,
              origin: event.origin,
            })
          }
        }
      } catch (error) {
        logError('Failed to handle iframe message', error, {
          component: 'IframeMessageHandler',
          origin: event.origin,
        })

        // Send error response
        event.source?.postMessage(
          {
            type: 'ERROR',
            error: 'Failed to process message',
          },
          { targetOrigin: event.origin },
        )
      }
    }

    // Add event listener
    window.addEventListener('message', handleMessage)

    // Send ready signal to parent
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'IFRAME_READY' }, '*')
    }

    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [])

  return null
}
