import { CloudArrowUpIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import { FaKey, FaLock } from 'react-icons/fa'

interface CloudSyncIntroModalProps {
  isOpen: boolean
  onClose: () => void
  isDarkMode: boolean
}

export function CloudSyncIntroModal({
  isOpen,
  onClose,
  isDarkMode,
}: CloudSyncIntroModalProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true)
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  if (!isVisible) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${
        isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative z-10 w-full max-w-md transform rounded-lg p-6 shadow-xl transition-all duration-300 ${
          isDarkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'
        } ${isOpen ? 'scale-100' : 'scale-95'}`}
      >
        <div className="mb-4 flex items-center justify-center">
          <div className="rounded-full bg-blue-100 p-3 dark:bg-blue-900">
            <CloudArrowUpIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
        </div>

        <h2 className="mb-4 text-center text-2xl font-bold">
          Your Chats are Now Synced to the Cloud
        </h2>

        <div className="mb-6 space-y-4">
          <p
            className={`text-center text-sm ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}
          >
            We've migrated your existing chats to our secure cloud storage.
            Here's what this means for you:
          </p>

          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <CloudArrowUpIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />
              <div>
                <p
                  className={`font-medium ${
                    isDarkMode ? 'text-gray-100' : 'text-gray-900'
                  }`}
                >
                  Automatic Syncing
                </p>
                <p
                  className={`text-sm ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}
                >
                  Your chats are automatically backed up and synced across your
                  devices.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <ShieldCheckIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500" />
              <div>
                <p
                  className={`font-medium ${
                    isDarkMode ? 'text-gray-100' : 'text-gray-900'
                  }`}
                >
                  End-to-End Encrypted
                </p>
                <p
                  className={`text-sm ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}
                >
                  All chats are encrypted before leaving your device.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <FaKey className="mt-0.5 h-5 w-5 flex-shrink-0 text-purple-500" />
              <div>
                <p
                  className={`font-medium ${
                    isDarkMode ? 'text-gray-100' : 'text-gray-900'
                  }`}
                >
                  Your Encryption Key
                </p>
                <p
                  className={`text-sm ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}
                >
                  You can manage your encryption key in the settings.
                </p>
              </div>
            </div>
          </div>

          <div
            className={`rounded-lg p-3 text-sm ${
              isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
            }`}
          >
            <div className="flex items-center space-x-2">
              <FaLock className="h-4 w-4 text-gray-500" />
              <p
                className={`font-medium ${
                  isDarkMode ? 'text-gray-200' : 'text-gray-800'
                }`}
              >
                Privacy First
              </p>
            </div>
            <p
              className={`mt-1 text-xs ${
                isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              We cannot read your chats. Only you have the encryption key.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className={`w-full rounded-lg px-4 py-2 font-medium transition-colors ${
            isDarkMode
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          Got it!
        </button>
      </div>
    </div>
  )
}
