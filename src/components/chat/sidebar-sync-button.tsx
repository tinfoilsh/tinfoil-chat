import { cn } from '@/components/ui/utils'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { GoSync } from 'react-icons/go'
import { PiSpinner } from 'react-icons/pi'
import { CONSTANTS } from './constants'

type SyncFeedback = 'idle' | 'syncing' | 'success'

interface SidebarSyncButtonProps {
  isDarkMode: boolean
  isSyncing: boolean
  syncFailed: boolean
  onSync: () => Promise<boolean>
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

export function SidebarSyncButton({
  isDarkMode,
  isSyncing,
  syncFailed,
  onSync,
}: SidebarSyncButtonProps) {
  const [feedback, setFeedback] = useState<SyncFeedback>('idle')
  const showSpinner = isSyncing || feedback === 'syncing'
  const isDisabled = isSyncing || feedback !== 'idle'
  const showSuccess = feedback === 'success'
  const statusLabel = showSpinner
    ? 'Syncing'
    : syncFailed
      ? 'Sync failed'
      : 'Sync healthy'

  const handleSync = async () => {
    const startedAt = Date.now()
    setFeedback('syncing')

    let succeeded = false
    try {
      succeeded = await onSync()
    } catch {
      succeeded = false
    }

    const remainingSpinnerTime = Math.max(
      0,
      CONSTANTS.SIDEBAR_SYNC_MIN_SPINNER_MS - (Date.now() - startedAt),
    )
    if (remainingSpinnerTime > 0) {
      await wait(remainingSpinnerTime)
    }

    if (!succeeded) {
      setFeedback('idle')
      return
    }

    setFeedback('success')
    await wait(CONSTANTS.SIDEBAR_SYNC_SUCCESS_FEEDBACK_MS)
    setFeedback('idle')
  }

  return (
    <div className="relative z-10 flex-none px-2 pt-2">
      <button
        type="button"
        onClick={() => void handleSync()}
        disabled={isDisabled}
        aria-label={`Sync chats. ${feedback === 'success' ? 'Synced' : statusLabel}`}
        className={cn(
          'flex w-full items-center justify-between rounded-lg border px-2 py-2 text-sm transition-colors disabled:cursor-default',
          showSpinner && 'opacity-60',
          isDarkMode
            ? 'border-border-strong bg-surface-chat text-content-primary hover:bg-surface-chat/80'
            : 'border-border-subtle bg-white text-content-primary hover:bg-gray-50',
        )}
      >
        <span className="flex items-center gap-2">
          {showSpinner ? (
            <PiSpinner className="h-4 w-4 animate-spin" />
          ) : (
            <GoSync className="h-4 w-4" />
          )}
          <span className="font-aeonik font-medium">Sync</span>
        </span>
        <span className="relative h-5 w-16 shrink-0">
          <motion.span
            initial={false}
            animate={{
              opacity: showSuccess ? 0 : 1,
              filter: showSuccess ? 'blur(2px)' : 'blur(0px)',
            }}
            transition={
              showSuccess
                ? {
                    duration: CONSTANTS.SIDEBAR_SYNC_FEEDBACK_EXIT_S,
                    ease: 'easeOut',
                  }
                : {
                    duration: CONSTANTS.SIDEBAR_SYNC_FEEDBACK_ENTER_S,
                    delay: CONSTANTS.SIDEBAR_SYNC_FEEDBACK_ENTER_DELAY_S,
                    ease: 'easeOut',
                  }
            }
            className="absolute inset-0 flex items-center justify-end"
            aria-hidden="true"
          >
            <motion.span
              initial={false}
              animate={{ scale: showSuccess ? 0.7 : 1 }}
              transition={
                showSuccess
                  ? {
                      duration: CONSTANTS.SIDEBAR_SYNC_FEEDBACK_EXIT_S,
                      ease: 'easeOut',
                    }
                  : {
                      duration: CONSTANTS.SIDEBAR_SYNC_FEEDBACK_ENTER_S,
                      delay: CONSTANTS.SIDEBAR_SYNC_FEEDBACK_ENTER_DELAY_S,
                      ease: 'easeOut',
                    }
              }
              className={cn(
                'h-2 w-2 rounded-full',
                syncFailed ? 'bg-orange-500' : 'bg-green-500',
              )}
              title={statusLabel}
            />
          </motion.span>
          <motion.span
            initial={false}
            animate={{
              opacity: showSuccess ? 1 : 0,
              y: showSuccess ? 0 : 3,
              filter: showSuccess ? 'blur(0px)' : 'blur(2px)',
            }}
            transition={
              showSuccess
                ? {
                    duration: CONSTANTS.SIDEBAR_SYNC_FEEDBACK_ENTER_S,
                    delay: CONSTANTS.SIDEBAR_SYNC_FEEDBACK_ENTER_DELAY_S,
                    ease: 'easeOut',
                  }
                : {
                    duration: CONSTANTS.SIDEBAR_SYNC_FEEDBACK_EXIT_S,
                    ease: 'easeOut',
                  }
            }
            className="pointer-events-none absolute inset-0 flex items-center justify-end whitespace-nowrap text-xs font-medium text-green-600 dark:text-green-400"
            aria-hidden={!showSuccess}
          >
            Synced!
          </motion.span>
        </span>
      </button>
    </div>
  )
}
