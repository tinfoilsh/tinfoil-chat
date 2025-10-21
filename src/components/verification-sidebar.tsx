import { getTinfoilClient } from '@/services/inference/tinfoil-client'
import { logError } from '@/utils/error-handling'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CONSTANTS } from './chat/constants'

type VerifierSidebarProps = {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  verificationComplete: boolean
  verificationSuccess?: boolean
  onVerificationComplete: (success: boolean) => void
  onVerificationUpdate?: (state: any) => void
  isDarkMode: boolean
  isClient: boolean
}

export function VerifierSidebar({
  isOpen,
  setIsOpen,
  verificationComplete,
  verificationSuccess,
  onVerificationComplete,
  onVerificationUpdate,
  isDarkMode,
  isClient,
}: VerifierSidebarProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [verificationDocument, setVerificationDocument] = useState<any>(null)

  const fetchVerificationDocument = useCallback(async () => {
    try {
      const client = await getTinfoilClient()
      await (client as any).ready?.()
    } catch (error) {
      logError('Tinfoil client verification failed', error, {
        component: 'VerifierSidebar',
        action: 'fetchVerificationDocument',
      })
    }

    try {
      const client = await getTinfoilClient()
      const doc = await (client as any).getVerificationDocument?.()
      if (doc) {
        setVerificationDocument(doc)
        if (isReady && iframeRef.current) {
          iframeRef.current.contentWindow?.postMessage(
            {
              type: 'TINFOIL_VERIFICATION_DOCUMENT',
              document: doc,
            },
            '*',
          )
        }
        if (onVerificationUpdate) {
          onVerificationUpdate(doc)
        }
        if (doc.securityVerified !== undefined) {
          onVerificationComplete(doc.securityVerified)
        }
      }
    } catch (error) {
      logError('Failed to fetch verification document', error, {
        component: 'VerifierSidebar',
        action: 'fetchVerificationDocument',
      })
    }
  }, [isReady, onVerificationUpdate, onVerificationComplete])

  // Handle messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Security: You may want to check event.origin here in production
      if (event.data.type === 'TINFOIL_VERIFICATION_CENTER_READY') {
        setIsReady(true)
        // Send verification document if we have it
        if (verificationDocument && iframeRef.current) {
          iframeRef.current.contentWindow?.postMessage(
            {
              type: 'TINFOIL_VERIFICATION_DOCUMENT',
              document: verificationDocument,
            },
            '*',
          )
        }
      } else if (event.data.type === 'TINFOIL_VERIFICATION_CENTER_CLOSED') {
        setIsOpen(false)
      } else if (event.data.type === 'TINFOIL_REQUEST_VERIFICATION_DOCUMENT') {
        // Refresh the verification document
        fetchVerificationDocument()
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [verificationDocument, setIsOpen, fetchVerificationDocument])

  // Fetch verification document when sidebar opens
  useEffect(() => {
    if (isOpen && isClient) {
      fetchVerificationDocument()
    }
  }, [isOpen, isClient, fetchVerificationDocument])

  // Control open/close state
  useEffect(() => {
    if (isReady && iframeRef.current) {
      const message = isOpen
        ? { type: 'TINFOIL_VERIFICATION_CENTER_OPEN' }
        : { type: 'TINFOIL_VERIFICATION_CENTER_CLOSE' }
      iframeRef.current.contentWindow?.postMessage(message, '*')
    }
  }, [isOpen, isReady])

  const iframeUrl = `https://verification-center.tinfoil.sh?darkMode=${isDarkMode}&showVerificationFlow=true&compact=false&open=true`

  return (
    <>
      {/* Right Sidebar wrapper */}
      <div
        className={`${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        } fixed right-0 z-40 flex h-dvh w-[85vw] overflow-hidden border-l border-border-subtle bg-surface-card font-aeonik transition-all duration-200 ease-in-out`}
        style={{ maxWidth: `${CONSTANTS.VERIFIER_SIDEBAR_WIDTH_PX}px` }}
      >
        {/* Verification Center iframe - takes full sidebar height */}
        {isClient && (
          <iframe
            ref={iframeRef}
            src={iframeUrl}
            className="h-full w-full"
            style={{ border: 'none' }}
            title="Tinfoil Verification Center"
          />
        )}
      </div>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}
