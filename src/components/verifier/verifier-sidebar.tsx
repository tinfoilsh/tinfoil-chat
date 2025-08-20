import { ShieldCheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useRef, useState } from 'react'
import { AiOutlineLoading3Quarters } from 'react-icons/ai'
import { FaGithub } from 'react-icons/fa'
import { LuRefreshCcwDot } from 'react-icons/lu'
import { CONSTANTS } from '../chat/constants'
import { VERIFIER_CONSTANTS } from './constants'
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
        } fixed right-0 z-40 flex h-dvh w-[85vw] flex-col border-l ${
          isDarkMode
            ? 'border-gray-700 bg-gray-900'
            : 'border-gray-200 bg-white'
        } overflow-hidden transition-all duration-200 ease-in-out`}
        style={{ maxWidth: `${CONSTANTS.VERIFIER_SIDEBAR_WIDTH_PX}px` }}
      >
        {/* Header with title and close button */}
        <div
          className={`flex h-16 flex-none items-center justify-between border-b ${
            isDarkMode ? 'border-gray-800' : 'border-gray-200'
          } p-4`}
        >
          <div className="flex items-center gap-2">
            <ShieldCheckIcon
              className={`h-6 w-6 ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}
            />
            <span
              className={`text-xl font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
            >
              Verification Center
            </span>
          </div>
          <button
            className={`rounded-lg p-2 transition-all duration-200 ${
              isDarkMode
                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
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

        {/* Related Links Section - pinned to bottom */}
        <div
          className={`flex-none border-t ${isDarkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'} px-3 py-2 sm:px-4 sm:py-3`}
        >
          {/* Action buttons */}
          <div className="mb-3 flex items-center justify-center gap-3">
            <button
              onClick={() => {
                if (!isVerifying) {
                  setTriggerVerify((prev) => prev + 1)
                  setIsVerifying(true)
                }
              }}
              disabled={isVerifying}
              className={`flex min-w-[130px] items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors ${
                isVerifying
                  ? 'cursor-not-allowed bg-[#005050]/60'
                  : 'bg-[#005050] hover:bg-[#004040]'
              }`}
            >
              {isVerifying ? (
                <AiOutlineLoading3Quarters className="h-4 w-4 animate-spin" />
              ) : (
                <LuRefreshCcwDot className="h-4 w-4" />
              )}
              {isVerifying ? 'Verifying...' : 'Verify Again'}
            </button>

            <button
              onClick={() =>
                window.open(
                  'https://github.com/tinfoilsh/verifier/',
                  '_blank',
                  'noopener,noreferrer',
                )
              }
              className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                isDarkMode
                  ? 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              <FaGithub className="h-4 w-4" />
              View Code
            </button>
          </div>

          <p
            className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
          >
            This automated verification tool lets you independently confirm that
            the models are running in secure enclaves, ensuring your
            conversations remain completely private.
          </p>
          <div className="mt-3">
            <button
              onClick={() =>
                window.open(
                  'https://docs.tinfoil.sh/verification/attestation-architecture',
                  '_blank',
                  'noopener,noreferrer',
                )
              }
              className={`w-full rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                isDarkMode
                  ? 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              Attestation Architecture
            </button>
            <p
              className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'} mt-3 text-center`}
            >
              In-Browser Verifier {VERIFIER_CONSTANTS.VERSION}
            </p>
          </div>
        </div>
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
