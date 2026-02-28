import { useUser } from '@clerk/nextjs'
import { Dialog, Transition } from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { AnimatePresence, motion } from 'framer-motion'
import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  PiArrowsLeftRight,
  PiGhostLight,
  PiGlobe,
  PiMonitor,
} from 'react-icons/pi'

import { SETTINGS_HAS_SEEN_WEB_SEARCH_INTRO } from '@/constants/storage-keys'

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
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    if (!isLoaded) return

    const checkIfSeen = async () => {
      if (user) {
        const hasSeen = user.unsafeMetadata?.[METADATA_KEY] === true
        if (!hasSeen) {
          setIsOpen(true)
        }
      }
      setIsReady(true)
    }

    checkIfSeen()
  }, [isLoaded, user])

  const markAsSeen = useCallback(async () => {
    // Always set localStorage so the flag persists after signout
    localStorage.setItem(SETTINGS_HAS_SEEN_WEB_SEARCH_INTRO, 'true')

    if (user) {
      await user.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          [METADATA_KEY]: true,
        },
      })
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
                  <div className="flex items-center justify-center space-x-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border-subtle bg-surface-chat">
                      <PiMonitor className="h-8 w-8 text-brand-accent-dark dark:text-white" />
                    </div>
                    <div className="flex items-center">
                      <PiArrowsLeftRight className="h-6 w-6 text-content-muted" />
                    </div>
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border-subtle bg-surface-chat">
                      <PiGlobe className="h-8 w-8 text-brand-accent-dark dark:text-white" />
                    </div>
                  </div>

                  <h2 className="text-center text-xl font-bold text-content-primary">
                    Introducing Private Web Search
                  </h2>

                  <div className="space-y-3 text-left text-sm text-content-secondary">
                    <p>
                      Your conversations can now be augmented with real-time web
                      search results.
                    </p>
                    <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-chat text-left">
                      <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="flex w-full items-center justify-between p-4 transition-colors hover:bg-content-primary/5"
                      >
                        <div className="flex items-center gap-2">
                          <PiGhostLight className="h-5 w-5 text-content-primary" />
                          <span className="text-sm font-medium text-content-primary">
                            Anonymous queries
                          </span>
                        </div>
                        <ChevronDownIcon
                          className={`h-4 w-4 text-content-muted transition-transform duration-200 ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className="overflow-hidden"
                          >
                            <p className="px-4 pb-4 text-sm text-content-secondary">
                              Tinfoil <b>never</b> sees your search queries.
                              Search queries are sent to our third-party search
                              provider (Exa) without exposing your IP address or
                              identity.
                              <a
                                href="https://tinfoil.sh/blog/2026-01-22-private-ai-web-search"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 block text-brand-accent-dark hover:underline"
                              >
                                Learn more about our web search architecture
                              </a>
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
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
