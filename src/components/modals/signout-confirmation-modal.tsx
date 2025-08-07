import { Dialog, Transition } from '@headlessui/react'
import {
  ArrowDownTrayIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { Fragment, useState } from 'react'

interface SignoutConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
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

  const downloadKeyAsPEM = () => {
    if (!encryptionKey) return

    // Convert the key to PEM format
    const pemContent = `-----BEGIN TINFOIL CHAT ENCRYPTION KEY-----
${encryptionKey.replace('key_', '')}
-----END TINFOIL CHAT ENCRYPTION KEY-----`

    // Create a blob and download
    const blob = new Blob([pemContent], { type: 'application/x-pem-file' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tinfoil-chat-key-${new Date().toISOString().split('T')[0]}.pem`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    setHasDownloadedKey(true)
  }

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
                  className={`flex items-center justify-between text-lg font-medium leading-6 ${
                    isDarkMode ? 'text-gray-100' : 'text-gray-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ExclamationTriangleIcon className="h-6 w-6 text-amber-500" />
                    <span>Important: Save Your Encryption Key</span>
                  </div>
                  <button
                    onClick={onClose}
                    aria-label="Close dialog"
                    className={`rounded-lg p-1 transition-colors ${
                      isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                    }`}
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </Dialog.Title>

                <div className="mt-4">
                  <div
                    className={`rounded-lg border p-4 ${
                      isDarkMode
                        ? 'border-amber-900 bg-amber-950/30'
                        : 'border-amber-200 bg-amber-50'
                    }`}
                  >
                    <p
                      className={`text-sm ${
                        isDarkMode ? 'text-amber-200' : 'text-amber-800'
                      }`}
                    >
                      <strong>Warning:</strong> Signing out will clear your
                      encryption key. Without this key, you won't be able to
                      decrypt your cloud-synced messages after signing back in.
                    </p>
                  </div>

                  {encryptionKey && (
                    <div className="mt-4">
                      <p
                        className={`mb-3 text-sm ${
                          isDarkMode ? 'text-gray-300' : 'text-gray-700'
                        }`}
                      >
                        Please download your encryption key before signing out:
                      </p>

                      <button
                        onClick={downloadKeyAsPEM}
                        className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                          hasDownloadedKey
                            ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                            : 'bg-blue-500 text-white hover:bg-blue-600'
                        }`}
                      >
                        <ArrowDownTrayIcon className="h-5 w-5" />
                        {hasDownloadedKey
                          ? 'Key Downloaded'
                          : 'Download Encryption Key (.pem)'}
                      </button>
                    </div>
                  )}

                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={onClose}
                      className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        isDarkMode
                          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={onConfirm}
                      disabled={encryptionKey && !hasDownloadedKey}
                      className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        encryptionKey && !hasDownloadedKey
                          ? isDarkMode
                            ? 'cursor-not-allowed bg-gray-700 text-gray-500'
                            : 'cursor-not-allowed bg-gray-200 text-gray-400'
                          : 'bg-red-500 text-white hover:bg-red-600'
                      }`}
                    >
                      Sign Out Anyway
                    </button>
                  </div>

                  <p
                    className={`mt-4 text-xs ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}
                  >
                    You can import your saved key later when signing back in to
                    restore access to your encrypted messages.
                  </p>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
