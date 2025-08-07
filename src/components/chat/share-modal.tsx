import { useToast } from '@/hooks/use-toast'
import {
  CheckIcon,
  DocumentDuplicateIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useState } from 'react'
import type { Message } from './types'

type ShareModalProps = {
  isOpen: boolean
  onClose: () => void
  messages: Message[]
  isDarkMode: boolean
}

export function ShareModal({
  isOpen,
  onClose,
  messages,
  isDarkMode,
}: ShareModalProps) {
  const { toast } = useToast()
  const [isCopied, setIsCopied] = useState(false)

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

      // Add the message content
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div
        className={`relative z-10 flex h-[80vh] w-[90vw] max-w-4xl flex-col rounded-xl shadow-xl ${
          isDarkMode ? 'bg-gray-800' : 'bg-white'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between border-b px-6 py-4 ${
            isDarkMode ? 'border-gray-700' : 'border-gray-200'
          }`}
        >
          <h2
            className={`text-lg font-semibold ${
              isDarkMode ? 'text-gray-100' : 'text-gray-900'
            }`}
          >
            Share Conversation
          </h2>
          <button
            onClick={onClose}
            className={`rounded-lg p-1.5 transition-colors ${
              isDarkMode
                ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <pre
            className={`whitespace-pre-wrap font-mono text-sm ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}
          >
            {markdown}
          </pre>
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-end gap-3 border-t px-6 py-4 ${
            isDarkMode ? 'border-gray-700' : 'border-gray-200'
          }`}
        >
          <button
            onClick={onClose}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              isDarkMode
                ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Close
          </button>
          <button
            onClick={handleCopy}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              isDarkMode
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-emerald-500 text-white hover:bg-emerald-600'
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
