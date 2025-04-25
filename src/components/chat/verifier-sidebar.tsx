import { XMarkIcon } from '@heroicons/react/24/outline'
import { useEffect, useRef } from 'react'
import { Verifier } from '../verifier/verifier'

type VerifierSidebarProps = {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  repo: string
  enclave: string
  digest: string
  verificationComplete: boolean
  verificationSuccess?: boolean
  onVerificationComplete: (success: boolean) => void
  isDarkMode: boolean
  isClient: boolean
  selectedModel: string
}

export function VerifierSidebar({
  isOpen,
  setIsOpen,
  repo,
  enclave,
  digest,
  verificationComplete,
  verificationSuccess,
  onVerificationComplete,
  isDarkMode,
  isClient,
  selectedModel,
}: VerifierSidebarProps) {
  const verifierKey = useRef<number>(0)

  // Update verifierKey when selectedModel changes to force remount
  useEffect(() => {
    if (isClient) {
      verifierKey.current += 1
    }
  }, [selectedModel, isClient])

  // Handle verification reset
  useEffect(() => {
    if (isClient) {
      const handleResetVerification = () => {
        verifierKey.current += 1
      }

      window.addEventListener('reset-verification', handleResetVerification)
      return () => {
        window.removeEventListener(
          'reset-verification',
          handleResetVerification,
        )
      }
    }
  }, [isClient])

  return (
    <>
      {/* Right Sidebar wrapper */}
      <div
        className={`${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        } fixed right-0 z-40 flex h-dvh w-[300px] flex-col ${
          isDarkMode
            ? 'bg-gray-900'
            : 'bg-gray-900'
        } overflow-hidden transition-all duration-200 ease-in-out`}
      >
        {/* Header with title and close button */}
        <div
          className={`flex h-12 flex-none items-center justify-between border-b ${
            isDarkMode ? 'border-gray-700' : 'border-gray-700'
          } sticky top-0 z-10 p-2 px-4`}
        >
          <h3
            className={`text-lg font-medium ${
              isDarkMode ? 'text-white' : 'text-white'
            }`}
          >
            In-browser Enclave Verifier
          </h3>
          <button
            className={`rounded-lg p-2 transition-all duration-200 ${
              isDarkMode
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            onClick={() => setIsOpen(false)}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Verifier content */}
        <div className="flex-1 overflow-y-auto">
          {isClient && (
            <Verifier
              key={verifierKey.current}
              onVerificationUpdate={() => {}}
              onVerificationComplete={onVerificationComplete}
              repo={repo}
              enclave={enclave}
              digest={digest || ''}
            />
          )}
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
