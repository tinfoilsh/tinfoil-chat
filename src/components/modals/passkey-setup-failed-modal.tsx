import { Dialog, Transition } from '@headlessui/react'
import {
  ArrowPathIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  KeyIcon,
} from '@heroicons/react/24/outline'
import { Fragment, useState } from 'react'

interface PasskeySetupFailedModalProps {
  isOpen: boolean
  /** User chose to retry the passkey flow. */
  onRetryPasskey: () => void
  /** User chose to fall back to the manual encryption-key backup flow. */
  onEnableManualBackup: () => void
  /** User dismissed the warning and chose to continue without backups. */
  onDismiss: () => void
  /** Passkey retry is currently in-flight; disables the buttons. */
  isRetryingPasskey?: boolean
}

export function PasskeySetupFailedModal({
  isOpen,
  onRetryPasskey,
  onEnableManualBackup,
  onDismiss,
  isRetryingPasskey = false,
}: PasskeySetupFailedModalProps) {
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false)
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={() => {}}>
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
                <div className="flex items-center justify-center">
                  <div className="rounded-full bg-amber-500/20 p-3">
                    <ExclamationTriangleIcon className="h-8 w-8 text-amber-500" />
                  </div>
                </div>

                <Dialog.Title
                  as="h2"
                  className="mt-4 text-center font-aeonik text-xl font-bold text-content-primary"
                >
                  Chats Are Not Being Backed Up
                </Dialog.Title>

                <div className="mt-4 space-y-3 text-sm text-content-secondary">
                  <p>
                    Tinfoil needs a passkey or a manually managed encryption key
                    to back up your chats.
                  </p>
                  <p className="font-semibold text-content-primary">
                    Your chats will only exist on this device.
                  </p>

                  <div className="rounded-lg border border-border-subtle">
                    <button
                      type="button"
                      onClick={() => setIsDetailsExpanded((prev) => !prev)}
                      aria-expanded={isDetailsExpanded}
                      className="flex w-full items-center justify-between p-3 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-chat/50"
                    >
                      <span>Why is this happening?</span>
                      <ChevronDownIcon
                        className={`h-4 w-4 transition-transform ${
                          isDetailsExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {isDetailsExpanded && (
                      <div className="space-y-2 border-t border-border-subtle bg-surface-card p-3 text-sm text-content-secondary">
                        <p>
                          Tinfoil works best with built-in passkey managers like
                          iCloud Keychain, Google Password Manager, or the
                          Passwords app in your device settings.
                        </p>
                        <p>
                          However, you can also create an encryption key that
                          you&apos;ll have to manage and copy across your
                          devices manually (don&apos;t lose your key!).
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  <button
                    onClick={onRetryPasskey}
                    disabled={isRetryingPasskey}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-accent-dark px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-accent-dark/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <ArrowPathIcon className="h-4 w-4" />
                    {isRetryingPasskey ? 'Trying...' : 'Try Again with Passkey'}
                  </button>

                  <button
                    onClick={onEnableManualBackup}
                    disabled={isRetryingPasskey}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-chat px-4 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-chat/80 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <KeyIcon className="h-4 w-4" />
                    Enable Manual Backup
                  </button>

                  <button
                    onClick={onDismiss}
                    disabled={isRetryingPasskey}
                    className="w-full text-center text-sm text-content-muted transition-colors hover:text-content-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Continue Without Backup
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
