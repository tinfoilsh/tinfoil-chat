import { useToast } from '@/hooks/use-toast'
import { Dialog, Transition } from '@headlessui/react'
import {
  ClipboardDocumentIcon,
  KeyIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { Fragment, useState } from 'react'

interface EncryptionKeyModalProps {
  isOpen: boolean
  onClose: () => void
  encryptionKey: string | null
  onKeyChange: (key: string) => Promise<void>
  isDarkMode: boolean
}

export function EncryptionKeyModal({
  isOpen,
  onClose,
  encryptionKey,
  onKeyChange,
  isDarkMode,
}: EncryptionKeyModalProps) {
  const [inputKey, setInputKey] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const { toast } = useToast()

  const handleCopyKey = async () => {
    if (!encryptionKey) return

    try {
      await navigator.clipboard.writeText(encryptionKey)
      toast({
        title: 'Encryption key copied',
        description: 'The key has been copied to your clipboard',
      })
    } catch (error) {
      toast({
        title: 'Failed to copy',
        description: 'Could not copy encryption key to clipboard',
        variant: 'destructive',
      })
    }
  }

  const handleUpdateKey = async () => {
    if (!inputKey.trim()) {
      toast({
        title: 'Invalid key',
        description: 'Please enter a valid encryption key',
        variant: 'destructive',
      })
      return
    }

    setIsUpdating(true)
    try {
      await onKeyChange(inputKey)
      toast({
        title: 'Key updated',
        description: 'Your encryption key has been updated successfully',
      })
      setInputKey('')
      onClose()
    } catch (error) {
      toast({
        title: 'Invalid key',
        description: 'The encryption key you entered is invalid',
        variant: 'destructive',
      })
    } finally {
      setIsUpdating(false)
    }
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
                    <KeyIcon className="h-5 w-5" />
                    Encryption Key Management
                  </div>
                  <button
                    onClick={onClose}
                    className={`rounded-lg p-1 transition-colors ${
                      isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                    }`}
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </Dialog.Title>

                <div className="mt-4">
                  {/* Current Key Section */}
                  <div className="mb-6">
                    <h4
                      className={`mb-2 text-sm font-medium ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}
                    >
                      Your Current Encryption Key
                    </h4>
                    <div
                      className={`rounded-lg border ${
                        isDarkMode
                          ? 'border-gray-700 bg-gray-900'
                          : 'border-gray-200 bg-gray-50'
                      } p-3`}
                    >
                      {encryptionKey ? (
                        <div className="flex items-center justify-between">
                          <code
                            className={`text-xs ${
                              isDarkMode ? 'text-gray-400' : 'text-gray-600'
                            }`}
                          >
                            {encryptionKey.substring(0, 20)}...
                          </code>
                          <button
                            onClick={handleCopyKey}
                            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                              isDarkMode
                                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                          >
                            <ClipboardDocumentIcon className="h-4 w-4" />
                            Copy
                          </button>
                        </div>
                      ) : (
                        <p
                          className={`text-sm ${
                            isDarkMode ? 'text-gray-500' : 'text-gray-500'
                          }`}
                        >
                          No encryption key set
                        </p>
                      )}
                    </div>
                    <p
                      className={`mt-2 text-xs ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}
                    >
                      Keep this key safe. You'll need it to decrypt your chats
                      on other devices. Keys start with "key_" followed by
                      lowercase letters and numbers.
                    </p>
                  </div>

                  {/* Update Key Section */}
                  <div>
                    <h4
                      className={`mb-2 text-sm font-medium ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}
                    >
                      Sync With Another Device
                    </h4>
                    <p
                      className={`mb-3 text-xs ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}
                    >
                      Enter the encryption key from your other device to sync
                      chats.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={inputKey}
                        onChange={(e) => setInputKey(e.target.value)}
                        placeholder="Enter encryption key (e.g., key_abc123...)"
                        className={`flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          isDarkMode
                            ? 'border-gray-700 bg-gray-900 text-white placeholder-gray-500'
                            : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'
                        }`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleUpdateKey()
                          }
                        }}
                      />
                      <button
                        onClick={handleUpdateKey}
                        disabled={isUpdating || !inputKey.trim()}
                        className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                          isUpdating || !inputKey.trim()
                            ? isDarkMode
                              ? 'cursor-not-allowed bg-gray-700 text-gray-500'
                              : 'cursor-not-allowed bg-gray-200 text-gray-400'
                            : 'bg-emerald-500 text-white hover:bg-emerald-600'
                        }`}
                      >
                        {isUpdating ? 'Updating...' : 'Update'}
                      </button>
                    </div>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
