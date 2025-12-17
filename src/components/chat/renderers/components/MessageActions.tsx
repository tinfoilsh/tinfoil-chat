import { CONSTANTS } from '@/components/chat/constants'
import { logWarning } from '@/utils/error-handling'
import { convertLatexForCopy } from '@/utils/latex-processing'
import { memo, useEffect, useRef, useState } from 'react'
import { BsCheckLg, BsCopy } from 'react-icons/bs'

interface MessageActionsProps {
  content: string
  isDarkMode: boolean
}

export const MessageActions = memo(function MessageActions({
  content,
  isDarkMode,
}: MessageActionsProps) {
  const [isCopied, setIsCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleCopy = () => {
    const textToCopy = convertLatexForCopy(content)

    // Check if clipboard API is available
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return // Silently fail if clipboard API is not available
    }

    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        setIsCopied(true)
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
        timeoutRef.current = setTimeout(() => {
          setIsCopied(false)
          timeoutRef.current = null
        }, CONSTANTS.COPY_TIMEOUT_MS)
      })
      .catch((error) => {
        logWarning('Failed to copy message to clipboard', {
          component: 'MessageActions',
          action: 'copyMessage',
          metadata: {
            errorMessage: error?.message || 'Unknown error',
          },
        })
      })
  }

  return (
    <div className="mb-2 mt-1 px-4">
      <button
        type="button"
        onClick={handleCopy}
        className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-all ${
          isCopied
            ? 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400'
            : isDarkMode
              ? 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-300'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
        }`}
        aria-label="Copy message"
      >
        {isCopied ? (
          <>
            <BsCheckLg className="h-3.5 w-3.5" />
            <span aria-live="polite">Copied!</span>
          </>
        ) : (
          <BsCopy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  )
})
