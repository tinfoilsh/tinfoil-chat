import { XMarkIcon } from '@heroicons/react/24/outline'
import { useEffect, useRef } from 'react'
import { Verifier } from '../verifier/verifier'
import Image from 'next/image'

type VerifierSidebarProps = {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  repo: string
  enclave: string
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
        } fixed right-0 z-40 flex h-dvh w-[350px] flex-col border-l ${
          isDarkMode
            ? 'border-gray-700 bg-gray-900'
            : 'border-gray-200 bg-white'
        } overflow-hidden transition-all duration-200 ease-in-out`}
      >
        {/* Header with title and close button */}
        <div
          className={`flex h-16 flex-none items-center justify-between border-b ${
            isDarkMode ? 'border-gray-800' : 'border-gray-200'
          } p-4`}
        >
          <div className="flex items-center gap-2">
            <Image
              src={isDarkMode ? "/icon-dark.png" : "/icon-light.png"}
              alt="Tinfoil Logo"
              width={24}
              height={24}
            />
            <span className={`text-xl font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Verification Center</span>
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

        {/* Verifier content */}
        <div className="flex-1 overflow-y-auto">
          {isClient && (
            <Verifier
              key={verifierKey.current}
              onVerificationUpdate={() => {}}
              onVerificationComplete={onVerificationComplete}
              repo={repo}
              enclave={enclave}
              isDarkMode={isDarkMode}
            />
          )}
        </div>

        {/* SOC2 Compliance Footer */}
        <div className={`flex-none border-t h-[56px] flex items-center justify-center ${
          isDarkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'
        } p-3`}>
          <div className="flex items-center justify-center gap-2">
            <Image
              src="/verification-logos/soc2.png"
              alt="SOC2 Type I Compliant"
              width={24}
              height={24}
            />
            <p className={`text-xs ${
              isDarkMode ? 'text-gray-400' : 'text-gray-500'
            }`}>
              Tinfoil is SOC2 Type I compliant
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
