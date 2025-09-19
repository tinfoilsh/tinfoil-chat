import { ShieldCheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useRef, useState } from 'react'
import { CONSTANTS } from '../chat/constants'
import { Verifier } from './verifier'

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
  const verifierKey = useRef<number>(0)
  const [triggerVerify, setTriggerVerify] = useState(0)
  const [isVerifying, setIsVerifying] = useState(false)
  const [flowDiagramExpanded, setFlowDiagramExpanded] = useState(false)

  return (
    <>
      {/* Right Sidebar wrapper */}
      <div
        className={`${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        } fixed right-0 z-40 flex h-dvh w-[85vw] flex-col overflow-hidden border-l border-border-subtle bg-surface-card font-aeonik transition-all duration-200 ease-in-out`}
        style={{ maxWidth: `${CONSTANTS.VERIFIER_SIDEBAR_WIDTH_PX}px` }}
      >
        {/* Header with title and close button */}
        <div className="flex h-16 flex-none items-center justify-between border-b border-border-subtle p-4">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="h-6 w-6 text-content-primary" />
            <span className="font-aeonik text-xl font-medium text-content-primary">
              Verification Center
            </span>
          </div>
          <button
            className="rounded-lg bg-surface-chat p-2 text-content-primary transition-all duration-200 hover:bg-surface-chat/80"
            onClick={() => setIsOpen(false)}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Verification Engine content */}
        <div className="flex-1 overflow-y-auto">
          {isClient && (
            <Verifier
              key={`${verifierKey.current}-${triggerVerify}`}
              onVerificationUpdate={(state) => {
                // Check if any verification is in progress
                const inProgress =
                  state.runtime.status === 'loading' ||
                  state.code.status === 'loading' ||
                  state.security.status === 'loading'
                setIsVerifying(inProgress)
                onVerificationUpdate?.(state)
              }}
              onVerificationComplete={(success) => {
                onVerificationComplete(success)
                setIsVerifying(false)
              }}
              isDarkMode={isDarkMode}
              flowDiagramExpanded={flowDiagramExpanded}
              onFlowDiagramToggle={() =>
                setFlowDiagramExpanded(!flowDiagramExpanded)
              }
            />
          )}
        </div>

        {/* Footer removed; actions moved to top inside verifier */}
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
