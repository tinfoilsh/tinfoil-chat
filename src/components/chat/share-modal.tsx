import { useToast } from '@/hooks/use-toast'
import {
  CheckIcon,
  DocumentDuplicateIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useEffect, useRef, useState } from 'react'
import { CONSTANTS } from './constants'
import type { Message } from './types'

type ShareModalProps = {
  isOpen: boolean
  onClose: () => void
  messages: Message[]
  isDarkMode: boolean
  isSidebarOpen?: boolean
  isRightSidebarOpen?: boolean
}

export function ShareModal({
  isOpen,
  onClose,
  messages,
  isDarkMode,
  isSidebarOpen = false,
  isRightSidebarOpen = false,
}: ShareModalProps) {
  const { toast } = useToast()
  const [isCopied, setIsCopied] = useState(false)
  const contentRef = useRef<HTMLPreElement>(null)

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Escape key to close modal
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      // Intercept Cmd+A (Mac) or Ctrl+A (Windows/Linux)
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === 'a' &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target as HTMLElement)?.isContentEditable
        )
      ) {
        e.preventDefault()
        e.stopPropagation()

        // Select all text in the modal content
        if (contentRef.current) {
          const selection = window.getSelection()
          const range = document.createRange()
          range.selectNodeContents(contentRef.current)
          selection?.removeAllRanges()
          selection?.addRange(range)
        }
      }
    }

    // Add event listener
    document.addEventListener('keydown', handleKeyDown)

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!isOpen) return null

  // Convert messages to markdown format
  const convertToMarkdown = () => {
    let markdown = ''

    messages.forEach((message) => {
      if (message.role === 'user') {
        markdown += '## User\n\n'
      } else if (message.role === 'assistant') {
        markdown += '## Assistant\n\n'
      }

      // Add the message content (raw, without processing)
      if (message.content) {
        markdown += message.content + '\n\n'
      }

      // Add document references if any
      if (message.documents && message.documents.length > 0) {
        markdown += '**Attached Documents:**\n'
        message.documents.forEach((doc) => {
          markdown += `- ${doc.name}\n`
        })
        markdown += '\n'
      }

      // Add document content if any
      if (message.documentContent) {
        markdown += '**Document Content:**\n'
        markdown += '```\n'
        markdown += message.documentContent
        markdown += '\n```\n\n'
      }

      markdown += '---\n\n'
    })

    return markdown.trim()
  }

  const handleCopy = async () => {
    try {
      const markdown = convertToMarkdown()
      await navigator.clipboard.writeText(markdown)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (error) {
      toast({
        title: 'Copy failed',
        description: 'Failed to copy to clipboard',
        variant: 'destructive',
        position: 'top-left',
      })
    }
  }

  const markdown = convertToMarkdown()

  // Calculate the positioning to center within the chat area
  const leftOffset = isSidebarOpen ? CONSTANTS.CHAT_SIDEBAR_WIDTH_PX : 0
  const rightOffset = isRightSidebarOpen
    ? CONSTANTS.SETTINGS_SIDEBAR_WIDTH_PX
    : 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        left: `${leftOffset}px`,
        right: `${rightOffset}px`,
      }}
    >
      {/* Backdrop - covers entire viewport */}
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
        style={{
          left: 0,
          right: 0,
        }}
      />

      {/* Modal */}
      <div
        className="relative z-10 flex h-[80vh] w-[90vw] max-w-4xl flex-col rounded-xl border border-border-subtle bg-surface-card shadow-xl"
        style={{
          maxWidth: `min(896px, calc(90vw - ${leftOffset + rightOffset}px))`,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
          <h2 className="text-lg font-semibold text-content-primary">
            Copy Conversation
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-content-secondary transition-colors hover:bg-surface-chat"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <pre
            ref={contentRef}
            className="whitespace-pre-wrap font-mono text-sm text-content-primary"
          >
            {markdown}
          </pre>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border-subtle px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-border-subtle bg-surface-chat px-4 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-chat/80"
          >
            Close
          </button>
          <button
            onClick={handleCopy}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              isDarkMode
                ? 'bg-brand-accent-dark text-white hover:bg-brand-accent-dark/90'
                : 'bg-brand-accent-dark text-white hover:bg-brand-accent-dark/90'
            }`}
          >
            {isCopied ? (
              <>
                <CheckIcon className="h-4 w-4" />
                Copied!
              </>
            ) : (
              <>
                <DocumentDuplicateIcon className="h-4 w-4" />
                Copy to Clipboard
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
