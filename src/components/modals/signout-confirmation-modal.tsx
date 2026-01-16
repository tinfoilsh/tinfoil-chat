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
  // Theme now derives from global CSS variables; keep prop for compatibility.
  void isDarkMode
  const [hasDownloadedKey, setHasDownloadedKey] = useState(false)
  const [isDeleteStarted, setIsDeleteStarted] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cachedKey, setCachedKey] = useState<string | null>(encryptionKey)

  // Update cached key when it's provided and reset states if it's a new key
  useEffect(() => {
    if (encryptionKey) {
      setCachedKey(encryptionKey)
      setHasDownloadedKey(false)
      setIsDeleteStarted(false)
    }
  }, [encryptionKey])

  const downloadKeyAsPEM = useCallback(() => {
    if (!cachedKey) return

    // Convert the key to PEM format
    const pemContent = `-----BEGIN TINFOIL CHAT ENCRYPTION KEY-----
${cachedKey.replace('key_', '')}
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
  }, [cachedKey])

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
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl border border-border-subtle bg-surface-card p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="font-aeonik text-lg font-medium leading-6 text-content-primary"
                >
                  Keep Your Local Data?
                </Dialog.Title>

                <div className="mt-6 space-y-5">
                  {/* Info Box */}
                  <div className="rounded-lg border border-border-subtle bg-surface-chat p-4">
                    <p className="text-sm text-content-secondary">
                      You&apos;ve been signed out.{' '}
                      {cachedKey
                        ? 'Your encryption key and local data are'
                        : 'Your local chats and settings are'}{' '}
                      still on this device.
                    </p>
                  </div>

                  {/* Step 1: Data Options */}
                  <div>
                    <div className="mb-4 flex flex-col gap-1.5">
                      <div className="flex items-center gap-3">
                        {isDeleteStarted && (
                          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500">
                            <CheckIcon className="h-3.5 w-3.5 text-white" />
                          </div>
                        )}
                        <p className="font-aeonik text-sm font-medium text-content-primary">
                          Choose what to do with your local data
                        </p>
                      </div>
                      <p className="text-xs text-content-muted">
                        Keep data to continue where you left off, or delete to
                        remove everything from your device.
                      </p>
                    </div>

                    {error && (
                      <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                      </div>
                    )}

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        onClick={() => {
                          if (!cachedKey) {
                            handleConfirm()
                          } else {
                            setIsDeleteStarted(true)
                          }
                        }}
                        disabled={isConfirming || isDeleteStarted}
                        className="flex-1 rounded-lg border border-destructive/50 bg-destructive px-4 py-3 text-sm font-medium text-destructive-foreground transition-all hover:bg-destructive/90 disabled:opacity-40"
                      >
                        {isConfirming ? 'Deleting...' : 'Delete All Data'}
                      </button>
                      <button
                        onClick={onClose}
                        disabled={isConfirming}
                        className="flex-1 rounded-lg border border-brand-accent-dark/40 bg-brand-accent-dark px-4 py-3 text-sm font-medium text-white transition-all hover:bg-brand-accent-dark/90 disabled:opacity-40"
                      >
                        Keep Local Data
                      </button>
                    </div>
                  </div>

                  {/* Step 2: Backup Key - only show if delete started and encryption key exists */}
                  {cachedKey && (
                    <Transition
                      show={isDeleteStarted}
                      as="div"
                      enter="transition-all duration-300 ease-out"
                      enterFrom="opacity-0 -translate-y-4 max-h-0"
                      enterTo="opacity-100 translate-y-0 max-h-40"
                      leave="transition-all duration-200 ease-in"
                      leaveFrom="opacity-100 translate-y-0 max-h-40"
                      leaveTo="opacity-0 -translate-y-4 max-h-0"
                      className="overflow-hidden"
                    >
                      <div className="pt-2">
                        <div className="mb-3 flex items-center gap-3">
                          {hasDownloadedKey && (
                            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500">
                              <CheckIcon className="h-3.5 w-3.5 text-white" />
                            </div>
                          )}
                          <p className="font-aeonik text-sm text-content-secondary">
                            Download your encryption key for future access
                          </p>
                        </div>
                        <button
                          onClick={downloadKeyAsPEM}
                          disabled={hasDownloadedKey}
                          className={`flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-all ${
                            hasDownloadedKey
                              ? 'cursor-not-allowed border-border-subtle bg-surface-chat text-content-muted'
                              : 'border-brand-accent-dark/40 bg-brand-accent-dark text-white hover:bg-brand-accent-dark/90'
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
                    </Transition>
                  )}

                  {/* Step 3: Final Confirmation - only show if key downloaded */}
                  {cachedKey && (
                    <Transition
                      show={hasDownloadedKey}
                      as="div"
                      enter="transition-all duration-300 ease-out"
                      enterFrom="opacity-0 -translate-y-4 max-h-0"
                      enterTo="opacity-100 translate-y-0 max-h-40"
                      leave="transition-all duration-200 ease-in"
                      leaveFrom="opacity-100 translate-y-0 max-h-40"
                      leaveTo="opacity-0 -translate-y-4 max-h-0"
                      className="overflow-hidden"
                    >
                      <div className="pt-2">
                        <div className="mb-3">
                          <p className="font-aeonik text-sm text-content-secondary">
                            Confirm data deletion
                          </p>
                        </div>
                        <button
                          onClick={handleConfirm}
                          disabled={isConfirming}
                          className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/50 bg-destructive px-4 py-3 text-sm font-medium text-destructive-foreground transition-all hover:bg-destructive/90 disabled:opacity-40"
                        >
                          {isConfirming
                            ? 'Deleting...'
                            : 'Delete Everything from Device'}
                        </button>
                      </div>
                    </Transition>
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
