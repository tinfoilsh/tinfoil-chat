import { cn } from '@/components/ui/utils'
import { AnimatePresence, motion } from 'framer-motion'
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
        <AnimatePresence initial={false}>
          {feedback === 'success' ? (
            <motion.span
              key="success"
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{
                duration: CONSTANTS.SIDEBAR_SYNC_FEEDBACK_ANIMATION_S,
              }}
              className="text-xs font-medium text-green-600 dark:text-green-400"
            >
              Synced!
            </motion.span>
          ) : (
            <motion.span
              key="status"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{
                duration: CONSTANTS.SIDEBAR_SYNC_FEEDBACK_ANIMATION_S,
              }}
              className={cn(
                'h-2 w-2 rounded-full',
                syncFailed ? 'bg-orange-500' : 'bg-green-500',
              )}
              title={statusLabel}
              aria-hidden="true"
            />
          )}
        </AnimatePresence>
      </button>
    </div>
  )
}
