import { logError } from '@/utils/error-handling'
import { Dialog, Transition } from '@headlessui/react'
import { ArrowDownTrayIcon, CheckIcon } from '@heroicons/react/24/outline'
import { Fragment, useCallback, useEffect, useState } from 'react'

interface SignoutConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  encryptionKey: string | null
  isDarkMode: boolean
}

export function SignoutConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  encryptionKey,
  isDarkMode,
}: SignoutConfirmationModalProps) {
  const [hasDownloadedKey, setHasDownloadedKey] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset download state when encryption key changes
  useEffect(() => {
    setHasDownloadedKey(false)
  }, [encryptionKey])

  const downloadKeyAsPEM = useCallback(() => {
    if (!encryptionKey) return

    // Convert the key to PEM format
    const pemContent = `-----BEGIN TINFOIL CHAT ENCRYPTION KEY-----
${encryptionKey.replace('key_', '')}
-----END TINFOIL CHAT ENCRYPTION KEY-----`

    // Create blob and trigger download
    const blob = new Blob([pemContent], { type: 'application/x-pem-file' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `tinfoil-chat-key-${new Date().toISOString().split('T')[0]}.pem`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    setHasDownloadedKey(true)
  }, [encryptionKey])

  const handleConfirm = useCallback(async () => {
    setIsConfirming(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      logError('Failed to delete data during signout', err, {
        component: 'SignoutConfirmationModal',
        action: 'handleConfirm',
      })
      setError('Failed to delete data. Please try again.')
    } finally {
      setIsConfirming(false)
    }
  }, [onConfirm])

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel
                className={`w-full max-w-md transform overflow-hidden rounded-2xl ${
                  isDarkMode ? 'bg-gray-800' : 'bg-white'
                } p-6 text-left align-middle shadow-xl transition-all`}
              >
                <Dialog.Title
                  as="h3"
                  className={`font-aeonik text-lg font-medium leading-6 ${
                    isDarkMode ? 'text-gray-100' : 'text-gray-900'
                  }`}
                >
                  Complete Sign Out
                </Dialog.Title>

                <div className="mt-6 space-y-5">
                  {/* Info Box */}
                  <div
                    className={`rounded-lg p-4 ${
                      isDarkMode ? 'bg-gray-700/50' : 'bg-gray-50'
                    }`}
                  >
                    <p
                      className={`text-sm ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-600'
                      }`}
                    >
                      You&apos;ve been signed out. Your encryption key and local
                      data are still on this device.
                    </p>
                  </div>

                  {encryptionKey && (
                    <>
                      {/* Step 1: Backup Key */}
                      <div>
                        <div className="mb-3 flex items-center gap-3">
                          <div
                            className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${
                              hasDownloadedKey
                                ? 'bg-emerald-500'
                                : isDarkMode
                                  ? 'bg-gray-700'
                                  : 'bg-gray-200'
                            }`}
                          >
                            {hasDownloadedKey ? (
                              <CheckIcon className="h-3.5 w-3.5 text-white" />
                            ) : (
                              <span
                                className={`text-xs font-medium ${
                                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                                }`}
                              >
                                1
                              </span>
                            )}
                          </div>
                          <p
                            className={`font-aeonik text-sm ${
                              isDarkMode ? 'text-gray-200' : 'text-gray-700'
                            }`}
                          >
                            Download your encryption key for future access
                          </p>
                        </div>
                        <button
                          onClick={downloadKeyAsPEM}
                          disabled={hasDownloadedKey}
                          className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                            hasDownloadedKey
                              ? isDarkMode
                                ? 'cursor-not-allowed bg-gray-700 text-gray-400'
                                : 'cursor-not-allowed bg-gray-100 text-gray-400'
                              : isDarkMode
                                ? 'bg-white text-gray-900 hover:bg-gray-100'
                                : 'bg-gray-900 text-white hover:bg-gray-800'
                          }`}
                        >
                          {!hasDownloadedKey && (
                            <ArrowDownTrayIcon className="hidden h-4 w-4 sm:block" />
                          )}
                          {hasDownloadedKey
                            ? 'Key Downloaded Successfully'
                            : 'Download Encryption Key'}
                        </button>
                      </div>

                      {/* Step 2: Data Options */}
                      <div>
                        <div className="mb-3 flex items-center gap-3">
                          <div
                            className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${
                              isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                            }`}
                          >
                            <span
                              className={`text-xs font-medium ${
                                isDarkMode ? 'text-gray-300' : 'text-gray-700'
                              }`}
                            >
                              2
                            </span>
                          </div>
                          <p
                            className={`font-aeonik text-sm ${
                              isDarkMode ? 'text-gray-200' : 'text-gray-700'
                            }`}
                          >
                            Choose what to do with your local data
                          </p>
                        </div>
                        {error && (
                          <div
                            className={`mb-3 rounded-lg p-3 text-sm ${
                              isDarkMode
                                ? 'border border-red-800 bg-red-900/20 text-red-400'
                                : 'border border-red-200 bg-red-50 text-red-600'
                            }`}
                          >
                            {error}
                          </div>
                        )}
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <button
                            onClick={onClose}
                            disabled={isConfirming}
                            className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                              isDarkMode
                                ? 'bg-[#005050] text-white hover:bg-[#004040] disabled:opacity-50'
                                : 'bg-[#005050] text-white hover:bg-[#004040] disabled:opacity-50'
                            }`}
                          >
                            Keep Local Data
                          </button>
                          <button
                            onClick={handleConfirm}
                            disabled={isConfirming}
                            className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                              isDarkMode
                                ? 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50'
                                : 'bg-red-500 text-white hover:bg-red-600 disabled:opacity-50'
                            }`}
                          >
                            {isConfirming ? 'Deleting...' : 'Delete All Data'}
                          </button>
                        </div>
                        <p
                          className={`mt-3 text-center text-xs ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}
                        >
                          Keep data to continue where you left off, or delete to
                          remove everything
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
