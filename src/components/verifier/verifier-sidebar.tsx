import { XMarkIcon } from '@heroicons/react/24/outline'
import Image from 'next/image'
import { useRef } from 'react'
import { CONSTANTS } from '../chat/constants'
import { Verifier } from './verifier'

// Import icons
import iconDark from './assets/icon-dark.png'
import iconLight from './assets/icon-light.png'

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
            <Image
              src={isDarkMode ? iconDark : iconLight}
              alt="Tinfoil Logo"
              width={24}
              height={24}
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

        {/* Verifier content */}
        <div className="flex-1 overflow-y-auto">
          {isClient && (
            <Verifier
              key={verifierKey.current}
              onVerificationUpdate={onVerificationUpdate}
              onVerificationComplete={onVerificationComplete}
              isDarkMode={isDarkMode}
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
