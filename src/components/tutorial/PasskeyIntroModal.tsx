import { Dialog, Transition } from '@headlessui/react'
import { Fragment, useCallback, useState } from 'react'
import { GoPasskeyFill } from 'react-icons/go'
import { PiArrowsLeftRight, PiKey } from 'react-icons/pi'

interface PasskeyIntroModalProps {
  isOpen: boolean
  /** User accepted — caller should trigger the actual WebAuthn passkey flow */
  onAccept: () => Promise<void>
}

export function PasskeyIntroModal({
  isOpen,
  onAccept,
}: PasskeyIntroModalProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleAccept = useCallback(async () => {
    setIsLoading(true)
    try {
      await onAccept()
    } finally {
      setIsLoading(false)
    }
  }, [onAccept])

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
              <Dialog.Panel className="w-full max-w-sm transform overflow-hidden rounded-2xl bg-surface-card p-6 text-left align-middle shadow-xl transition-all">
                <div className="space-y-4">
                  <div className="flex items-center justify-center space-x-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border-subtle bg-surface-chat">
                      <PiKey className="h-8 w-8 text-brand-accent-dark dark:text-white" />
                    </div>
                    <div className="flex items-center">
                      <PiArrowsLeftRight className="h-6 w-6 text-content-muted" />
                    </div>
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border-subtle bg-surface-chat">
                      <GoPasskeyFill className="h-8 w-8 text-brand-accent-dark dark:text-white" />
                    </div>
                  </div>

                  <h2 className="text-center text-xl font-bold text-content-primary">
                    Introducing Passkeys
                  </h2>

                  <div className="space-y-3 text-left text-sm text-content-secondary">
                    <p>
                      Cloud sync is now automatic—your device handles your
                      encryption key for you.
                    </p>
                    <p>
                      Your chats are still end-to-end encrypted and <b>only</b>{' '}
                      your Passkey can be used to unlock them.
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={handleAccept}
                      disabled={isLoading}
                      className="w-full rounded-lg bg-brand-accent-dark px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-accent-dark/90 disabled:opacity-40"
                    >
                      {isLoading ? 'Setting up...' : "Let's go!"}
                    </button>
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
