import { useToast } from '@/hooks/use-toast'
import { TINFOIL_COLORS } from '@/theme/colors'
import { Dialog, Transition } from '@headlessui/react'
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  CheckIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
  KeyIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'react-qr-code'

interface EncryptionKeyModalProps {
  isOpen: boolean
  onClose: () => void
  encryptionKey: string | null
  onKeyChange: (key: string) => Promise<void>
  isDarkMode: boolean
}

export function EncryptionKeyModal({
  isOpen,
  onClose,
  encryptionKey,
  onKeyChange,
  isDarkMode,
}: EncryptionKeyModalProps) {
  const [inputKey, setInputKey] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isQRCodeExpanded, setIsQRCodeExpanded] = useState(false)
  const { toast } = useToast()
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const handleCopyKey = async () => {
    if (!encryptionKey) return

    try {
      await navigator.clipboard.writeText(encryptionKey)
      setIsCopied(true)

      // Clear any existing timeout
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }

      // Set new timeout
      copyTimeoutRef.current = setTimeout(() => {
        setIsCopied(false)
        copyTimeoutRef.current = null
      }, 2000)
    } catch (error) {
      toast({
        title: 'Failed to copy',
        description: 'Could not copy encryption key to clipboard',
        variant: 'destructive',
      })
    }
  }

  const handleUpdateKey = async () => {
    if (!inputKey.trim()) {
      toast({
        title: 'Invalid key',
        description: 'Please enter a valid encryption key',
        variant: 'destructive',
      })
      return
    }

    setIsUpdating(true)
    try {
      await onKeyChange(inputKey)
      toast({
        title: 'Key updated',
        description: 'Your encryption key has been updated successfully',
      })
      setInputKey('')
      onClose()
    } catch (error) {
      toast({
        title: 'Invalid key',
        description: 'The encryption key you entered is invalid',
        variant: 'destructive',
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const downloadKeyAsPEM = () => {
    if (!encryptionKey) return

    // Convert the key to PEM format
    const pemContent = `-----BEGIN TINFOIL CHAT ENCRYPTION KEY-----
${encryptionKey.replace('key_', '')}
-----END TINFOIL CHAT ENCRYPTION KEY-----`

    // Create a blob and download
    const blob = new Blob([pemContent], { type: 'application/x-pem-file' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tinfoil-chat-key-${new Date().toISOString().split('T')[0]}.pem`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const extractKeyFromPEM = (pemContent: string): string | null => {
    const lines = pemContent.split('\n')
    const startIndex = lines.findIndex((line) =>
      line.includes('BEGIN TINFOIL CHAT ENCRYPTION KEY'),
    )
    const endIndex = lines.findIndex((line) =>
      line.includes('END TINFOIL CHAT ENCRYPTION KEY'),
    )

    if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
      const keyLines = lines.slice(startIndex + 1, endIndex)
      const keyContent = keyLines.join('').trim()
      return keyContent ? `key_${keyContent}` : null
    }

    return null
  }

  const handleFileImport = useCallback(
    async (file: File) => {
      try {
        const content = await file.text()
        const extractedKey = extractKeyFromPEM(content)

        if (extractedKey) {
          setInputKey(extractedKey)
        } else {
          toast({
            title: 'Invalid file',
            description: 'Could not extract encryption key from the PEM file',
            variant: 'destructive',
          })
        }
      } catch (error) {
        toast({
          title: 'Import failed',
          description: 'Failed to read the PEM file',
          variant: 'destructive',
        })
      }
    },
    [toast],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const files = Array.from(e.dataTransfer.files)
      const pemFile = files.find((file) => file.name.endsWith('.pem'))

      if (pemFile) {
        await handleFileImport(pemFile)
      } else {
        toast({
          title: 'Invalid file',
          description: 'Please drop a .pem file',
          variant: 'destructive',
        })
      }
    },
    [handleFileImport, toast],
  )

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      await handleFileImport(file)
      // Reset the input value to allow re-importing the same file
      e.target.value = ''
    }
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
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
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-surface-card p-4 text-left align-middle shadow-xl transition-all sm:p-6">
                <Dialog.Title
                  as="h3"
                  className="flex items-center justify-between text-base font-medium leading-6 text-content-primary sm:text-lg"
                >
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <KeyIcon className="h-4 w-4 text-content-primary sm:h-5 sm:w-5" />
                    <span className="text-sm sm:text-base">
                      Personal Encryption Key
                    </span>
                  </div>
                  <button
                    onClick={onClose}
                    aria-label="Close dialog"
                    className="rounded-lg p-1 text-content-secondary transition-colors hover:bg-surface-chat"
                  >
                    <XMarkIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>
                </Dialog.Title>

                <div className="mt-3 sm:mt-4">
                  {/* Current Key Section */}
                  <div className="mb-4 sm:mb-6">
                    <h4 className="mb-1.5 text-xs font-medium text-content-secondary sm:mb-2 sm:text-sm">
                      Current Encryption Key
                    </h4>
                    <div
                      className="rounded-lg border border-border-subtle bg-surface-chat p-2 sm:p-3"
                      role="region"
                      aria-label="Current encryption key"
                    >
                      {encryptionKey ? (
                        <div>
                          <div className="flex items-center justify-between">
                            <code className="font-mono text-xs text-brand-accent-light">
                              {encryptionKey.substring(0, 20)}...
                            </code>
                            <div className="flex gap-2">
                              <div className="group relative">
                                <button
                                  onClick={downloadKeyAsPEM}
                                  aria-label="Download encryption key as PEM file"
                                  className="flex items-center justify-center rounded-lg bg-surface-chat p-2 text-xs text-content-primary transition-all hover:bg-surface-chat/80 sm:text-sm"
                                >
                                  <ArrowDownTrayIcon className="h-4 w-4" />
                                </button>
                                <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 transform whitespace-nowrap rounded bg-surface-chat px-2 py-1 text-xs text-content-primary opacity-0 transition-opacity group-hover:opacity-100">
                                  Download
                                </div>
                              </div>
                              <div className="group relative">
                                <button
                                  onClick={handleCopyKey}
                                  aria-label={
                                    isCopied
                                      ? 'Key copied to clipboard'
                                      : 'Copy encryption key to clipboard'
                                  }
                                  className={`flex items-center justify-center rounded-lg p-2 text-xs transition-all sm:text-sm ${
                                    isCopied
                                      ? 'bg-emerald-500 text-white'
                                      : 'bg-surface-chat text-content-primary hover:bg-surface-chat/80'
                                  }`}
                                >
                                  {isCopied ? (
                                    <CheckIcon className="h-4 w-4" />
                                  ) : (
                                    <ClipboardDocumentIcon className="h-4 w-4" />
                                  )}
                                </button>
                                <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 transform whitespace-nowrap rounded bg-surface-chat px-2 py-1 text-xs text-content-primary opacity-0 transition-opacity group-hover:opacity-100">
                                  {isCopied ? 'Copied!' : 'Copy'}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-content-muted">
                          No encryption key set
                        </p>
                      )}
                    </div>
                    <p
                      id="current-key-description"
                      className="mt-1.5 hidden text-xs text-content-muted sm:mt-2 sm:block"
                    >
                      Save this key securely. You&apos;ll need it to access your
                      chats and projects on other devices.
                    </p>

                    {/* QR Code Section - Collapsible */}
                    {encryptionKey && (
                      <div className="mt-3 hidden rounded-lg border border-border-subtle sm:block">
                        <button
                          onClick={() => setIsQRCodeExpanded(!isQRCodeExpanded)}
                          className="flex w-full items-center justify-between p-3 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-chat/50"
                        >
                          <span>Key QR Code</span>
                          <ChevronDownIcon
                            className={`h-4 w-4 transition-transform ${
                              isQRCodeExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        {isQRCodeExpanded && (
                          <div className="flex justify-center rounded-b-lg border-t border-border-subtle bg-surface-card p-3">
                            <QRCode
                              value={encryptionKey}
                              size={160}
                              level="H"
                              bgColor={
                                isDarkMode
                                  ? TINFOIL_COLORS.surface.cardDark
                                  : TINFOIL_COLORS.surface.cardLight
                              }
                              fgColor={
                                isDarkMode
                                  ? TINFOIL_COLORS.utility.qrForegroundDark
                                  : TINFOIL_COLORS.utility.qrForegroundLight
                              }
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Update Key Section */}
                  <div>
                    <h4 className="mb-1.5 text-xs font-medium text-content-secondary sm:mb-2 sm:text-sm">
                      Restore or Sync Encryption Key
                    </h4>
                    <p
                      id="sync-key-description"
                      className="mb-2 text-xs text-content-muted sm:mb-3"
                    >
                      Enter or import your existing encryption key.
                    </p>

                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className="space-y-2"
                    >
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={inputKey}
                          onChange={(e) => setInputKey(e.target.value)}
                          placeholder="Enter new key (e.g., key_abc123...)"
                          autoComplete="off"
                          aria-label="Encryption key input"
                          aria-describedby="sync-key-description"
                          aria-invalid={isUpdating ? 'false' : undefined}
                          className={`flex-1 rounded-lg border bg-surface-input px-2 py-1.5 text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-brand-accent-light sm:px-3 sm:py-2 sm:text-sm ${
                            isDragging
                              ? 'border-brand-accent-light'
                              : 'border-border-subtle'
                          }`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !isUpdating) {
                              handleUpdateKey()
                            }
                          }}
                        />
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pem"
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="rounded-lg border border-border-subtle bg-surface-chat p-2 text-content-primary transition-colors hover:bg-surface-chat/80"
                          title="Upload PEM file"
                        >
                          <ArrowUpTrayIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={handleUpdateKey}
                          disabled={isUpdating || !inputKey.trim()}
                          aria-label="Update encryption key"
                          aria-busy={isUpdating}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:py-2 sm:text-sm ${
                            isUpdating || !inputKey.trim()
                              ? 'cursor-not-allowed bg-surface-chat text-content-muted'
                              : 'bg-brand-accent-dark text-white hover:bg-brand-accent-dark/90'
                          }`}
                        >
                          {isUpdating ? 'Updating...' : 'Update'}
                        </button>
                      </div>
                      {isDragging && (
                        <p className="text-center text-sm text-brand-accent-light">
                          Drop your PEM file here
                        </p>
                      )}
                    </div>
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
