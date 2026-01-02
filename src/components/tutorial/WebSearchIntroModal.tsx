import { useUser } from '@clerk/nextjs'
import { Dialog, Transition } from '@headlessui/react'
import { Fragment, useCallback, useEffect, useState } from 'react'
import { BsIncognito } from 'react-icons/bs'
import { PiGlobe } from 'react-icons/pi'

const STORAGE_KEY = 'has_seen_web_search_intro'
const METADATA_KEY = 'has_seen_web_search_intro'

interface WebSearchIntroModalProps {
  onEnableWebSearch: () => void
}

export function WebSearchIntroModal({
  onEnableWebSearch,
}: WebSearchIntroModalProps) {
  const { user, isLoaded } = useUser()
  const [isOpen, setIsOpen] = useState(false)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!isLoaded) return

    const checkIfSeen = async () => {
      if (user) {
        const hasSeen = user.unsafeMetadata?.[METADATA_KEY] === true
        if (!hasSeen) {
          setIsOpen(true)
        }
      } else {
        const hasSeen = localStorage.getItem(STORAGE_KEY)
        if (!hasSeen) {
          setIsOpen(true)
        }
      }
      setIsReady(true)
    }

    checkIfSeen()
  }, [isLoaded, user])

  const markAsSeen = useCallback(async () => {
    if (user) {
      await user.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          [METADATA_KEY]: true,
        },
      })
    } else {
      localStorage.setItem(STORAGE_KEY, 'true')
    }
  }, [user])

  const handleDismiss = useCallback(async () => {
    setIsOpen(false)
    await markAsSeen()
  }, [markAsSeen])

  const handleEnable = useCallback(async () => {
    setIsOpen(false)
    await markAsSeen()
    onEnableWebSearch()
  }, [markAsSeen, onEnableWebSearch])

  if (!isReady) return null

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleDismiss}>
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
                  <div className="flex items-center justify-center">
                    <div className="rounded-full bg-brand-accent-dark/20 p-3">
                      <PiGlobe className="h-8 w-8 text-brand-accent-dark dark:text-white" />
                    </div>
                  </div>

                  <h2 className="text-center text-xl font-bold text-content-primary">
                    Introducing Private Web Search
                  </h2>

                  <div className="space-y-3 text-center text-sm text-content-secondary">
                    <p>
                      Your conversations can now be augmented with real-time web
                      search results.
                    </p>
                    <div className="rounded-xl border border-border-subtle bg-surface-chat p-4 text-left">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-content-primary/10">
                          <BsIncognito className="h-3 w-3 text-content-primary" />
                        </div>
                        <span className="text-sm font-medium text-content-primary">
                          Anonymous queries
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-content-secondary">
                        Search queries are sent to third-party providers (Exa,
                        DuckDuckGo, Bing) without exposing your IP address or
                        identity. Only an anonymized query is sent and Tinfoil{' '}
                        <b>never</b> sees your search queries.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleDismiss}
                      className="flex-1 rounded-lg border border-border-subtle bg-surface-chat px-4 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-chat/80"
                    >
                      Not now
                    </button>
                    <button
                      onClick={handleEnable}
                      className="flex-1 rounded-lg bg-brand-accent-dark px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-accent-dark/90"
                    >
                      Turn on
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
