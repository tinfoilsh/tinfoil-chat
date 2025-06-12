import {
  ChevronDownIcon,
  DocumentIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { Verifier } from '../verifier/verifier'

export type VerifierModel = {
  id: string
  name: string
  displayName?: string
  type?: 'chat' | 'audio' | 'document'
  image?: string
  repo: string
  enclave: string
}

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
  models?: VerifierModel[]
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
  models = [],
}: VerifierSidebarProps) {
  const verifierKey = useRef<number>(0)
  const [activeModelTab, setActiveModelTab] = useState<string>(selectedModel)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Update verifierKey when activeModelTab changes to force remount
  useEffect(() => {
    if (isClient) {
      verifierKey.current += 1
    }
  }, [activeModelTab, isClient])

  // Update active tab when selectedModel changes
  useEffect(() => {
    setActiveModelTab(selectedModel)
  }, [selectedModel])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false)
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isDropdownOpen])

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
              src={isDarkMode ? '/icon-dark.png' : '/icon-light.png'}
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

        {/* Model dropdown */}
        {models.length > 0 && (
          <div
            className={`border-b ${isDarkMode ? 'border-gray-800' : 'border-gray-200'} p-4`}
          >
            <label
              className={`mb-2 block text-xs font-medium ${
                isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              Select Model to Verify
            </label>
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`flex w-full items-center justify-between rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                  isDarkMode
                    ? 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {(() => {
                    const activeModel = models.find(
                      (m) => m.id === activeModelTab,
                    )
                    if (!activeModel) return null

                    return (
                      <>
                        {activeModel.image ? (
                          <img
                            src={activeModel.image}
                            alt={activeModel.name}
                            className="h-4 w-4"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                        ) : activeModel.type === 'document' ? (
                          <DocumentIcon className="h-4 w-4" />
                        ) : null}
                        <span>
                          {activeModel.displayName || activeModel.name}
                        </span>
                        {activeModel.type && activeModel.type !== 'chat' && (
                          <span
                            className={`text-xs capitalize ${
                              isDarkMode ? 'text-gray-500' : 'text-gray-400'
                            }`}
                          >
                            ({activeModel.type})
                          </span>
                        )}
                      </>
                    )
                  })()}
                </div>
                <ChevronDownIcon
                  className={`h-4 w-4 transition-transform ${
                    isDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isDropdownOpen && (
                <div
                  className={`absolute left-0 right-0 z-10 mt-2 rounded-lg border shadow-lg ${
                    isDarkMode
                      ? 'border-gray-700 bg-gray-800'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  {models.map((model) => {
                    const isActive = activeModelTab === model.id

                    return (
                      <button
                        key={model.id}
                        onClick={() => {
                          setActiveModelTab(model.id)
                          setIsDropdownOpen(false)
                          // Reset verification when model changes
                          onVerificationComplete(false)
                        }}
                        className={`flex w-full items-center gap-2 px-4 py-2.5 text-sm transition-all ${
                          isActive
                            ? isDarkMode
                              ? 'bg-gray-700 text-emerald-500'
                              : 'bg-gray-100 text-emerald-600'
                            : isDarkMode
                              ? 'text-gray-300 hover:bg-gray-700'
                              : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {model.image ? (
                          <img
                            src={model.image}
                            alt={model.name}
                            className="h-4 w-4 flex-shrink-0"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                        ) : model.type === 'document' ? (
                          <DocumentIcon className="h-4 w-4 flex-shrink-0" />
                        ) : (
                          <div className="h-4 w-4" />
                        )}
                        <span className="flex-1 text-left">
                          {model.displayName || model.name}
                        </span>
                        {model.type && model.type !== 'chat' && (
                          <span
                            className={`text-xs capitalize ${
                              isDarkMode ? 'text-gray-500' : 'text-gray-400'
                            }`}
                          >
                            ({model.type})
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Verifier content */}
        <div className="flex-1 overflow-y-auto">
          {isClient &&
            (() => {
              const activeModel =
                models.find((m) => m.id === activeModelTab) ||
                (models.length > 0 ? models[0] : null)

              if (!activeModel) {
                // Fallback to original props if no models provided
                return (
                  <Verifier
                    key={verifierKey.current}
                    onVerificationUpdate={() => {}}
                    onVerificationComplete={onVerificationComplete}
                    repo={repo}
                    enclave={enclave}
                    isDarkMode={isDarkMode}
                  />
                )
              }

              return (
                <Verifier
                  key={verifierKey.current}
                  onVerificationUpdate={() => {}}
                  onVerificationComplete={onVerificationComplete}
                  repo={activeModel.repo}
                  enclave={activeModel.enclave}
                  isDarkMode={isDarkMode}
                />
              )
            })()}
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
