'use client'

import { cn } from '@/components/ui/utils'
import { XMarkIcon } from '@heroicons/react/24/outline'
import type { NotifyBannerState } from './hooks/use-stream-notify-banner'

interface StreamNotifyBannerProps {
  bannerState: NotifyBannerState
  onNotify: () => void
  onDismiss: () => void
  isDarkMode: boolean
}

function bannerMessage(state: NotifyBannerState): string {
  switch (state) {
    case 'confirmed':
      return "You'll be notified when the response is ready."
    case 'failed':
      return "Notifications couldn't be enabled for this browser."
    default:
      return 'Want to be notified when the assistant responds?'
  }
}

/**
 * Inline offer rendered directly above the chat input while a response has
 * been pending for a while. Clicking Notify asks for notification permission
 * and registers a push for when the stream completes, so the user can leave
 * the tab.
 */
export function StreamNotifyBanner({
  bannerState,
  onNotify,
  onDismiss,
  isDarkMode,
}: StreamNotifyBannerProps) {
  if (bannerState === 'hidden') return null

  const showActions = bannerState === 'offer' || bannerState === 'enabling'

  return (
    <div
      role="status"
      className="mb-2 flex items-center gap-2 rounded-2xl border border-border-subtle bg-surface-card px-4 py-2.5 text-content-primary shadow-sm transition-colors"
    >
      <p className="min-w-0 flex-1 text-sm">{bannerMessage(bannerState)}</p>
      <div className="flex flex-shrink-0 items-center gap-1.5">
        {showActions && (
          <button
            type="button"
            onClick={onNotify}
            disabled={bannerState === 'enabling'}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-60',
              isDarkMode
                ? 'bg-white text-gray-900 hover:bg-gray-200'
                : 'bg-gray-900 text-white hover:bg-gray-700',
            )}
          >
            {bannerState === 'enabling' ? 'Enabling…' : 'Notify'}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification offer"
          className={cn(
            'rounded p-1 transition-colors',
            isDarkMode ? 'hover:bg-white/10' : 'hover:bg-black/5',
          )}
        >
          <XMarkIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
