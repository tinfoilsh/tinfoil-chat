import { useToast } from '@/hooks/use-toast'
import { encryptionService } from '@/services/encryption/encryption-service'
import { TINFOIL_COLORS } from '@/theme/colors'
import { setCloudSyncEnabled as persistCloudSyncEnabled } from '@/utils/cloud-sync-settings'
import { logError, logInfo } from '@/utils/error-handling'
import { Dialog, Transition } from '@headlessui/react'
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  CheckIcon,
  CloudArrowUpIcon,
  KeyIcon,
  LockClosedIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'react-qr-code'

interface CloudSyncSetupModalProps {
  isOpen: boolean
  onClose: () => void
  onSetupComplete: (encryptionKey: string) => void
  isDarkMode: boolean
  initialCloudSyncEnabled?: boolean
}

type SetupStep = 'intro' | 'generate-or-restore' | 'key-display' | 'restore-key'

export function CloudSyncSetupModal({
  isOpen,
  onClose,
  onSetupComplete,
  isDarkMode,
  initialCloudSyncEnabled = false,
}: CloudSyncSetupModalProps) {
  const [currentStep, setCurrentStep] = useState<SetupStep>('intro')
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(
    initialCloudSyncEnabled,
  )
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [inputKey, setInputKey] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const { toast } = useToast()
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const handleEnableToggle = (enabled: boolean) => {
    setCloudSyncEnabled(enabled)
    if (!enabled) {
      persistCloudSyncEnabled(false)
      onClose()
    }
  }

  const handleMaybeLater = () => {
    persistCloudSyncEnabled(false)
    localStorage.setItem('hasSeenCloudSyncModal', 'true')
    onClose()
  }

  const handleContinue = () => {
    if (!cloudSyncEnabled) {
      setCloudSyncEnabled(true)
    }
    setCurrentStep('generate-or-restore')
  }

  const handleGenerateKey = async () => {
    setIsProcessing(true)
    try {
      const newKey = await encryptionService.generateKey()
      await encryptionService.setKey(newKey)
      setGeneratedKey(newKey)
      setCloudSyncEnabled(true)
      persistCloudSyncEnabled(true)

      logInfo('Generated new encryption key for cloud sync', {
        component: 'CloudSyncSetupModal',
        action: 'handleGenerateKey',
      })

      setCurrentStep('key-display')
    } catch (error) {
      logError('Failed to generate encryption key', error, {
        component: 'CloudSyncSetupModal',
        action: 'handleGenerateKey',
      })
      toast({
        title: 'Error',
        description: 'Failed to generate encryption key',
        variant: 'destructive',
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleRestoreKey = async () => {
    if (!inputKey.trim()) {
      toast({
        title: 'Invalid key',
        description: 'Please enter a valid encryption key',
        variant: 'destructive',
      })
      return
    }

    setIsProcessing(true)
    try {
      await encryptionService.setKey(inputKey)
      setCloudSyncEnabled(true)
      persistCloudSyncEnabled(true)
      localStorage.setItem('hasSeenCloudSyncModal', 'true')

      logInfo('Restored encryption key for cloud sync', {
        component: 'CloudSyncSetupModal',
        action: 'handleRestoreKey',
      })

      toast({
        title: 'Success',
        description: 'Encryption key restored successfully',
      })

      onSetupComplete(inputKey)
      onClose()
    } catch (error) {
      logError('Failed to restore encryption key', error, {
        component: 'CloudSyncSetupModal',
        action: 'handleRestoreKey',
      })
      toast({
        title: 'Invalid key',
        description: 'The encryption key you entered is invalid',
        variant: 'destructive',
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCopyKey = async () => {
    if (!generatedKey) return

    try {
      await navigator.clipboard.writeText(generatedKey)
      setIsCopied(true)

      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }

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

  const downloadKeyAsPEM = () => {
    if (!generatedKey) return

    const pemContent = `-----BEGIN TINFOIL CHAT ENCRYPTION KEY-----
${generatedKey.replace('key_', '')}
-----END TINFOIL CHAT ENCRYPTION KEY-----`

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
      e.target.value = ''
    }
  }

  const handleComplete = () => {
    localStorage.setItem('hasSeenCloudSyncModal', 'true')
    if (generatedKey) {
      onSetupComplete(generatedKey)
    }
    onClose()
  }

  const renderIntroStep = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-center">
        <div className="rounded-full bg-brand-accent-light/20 p-3">
          <CloudArrowUpIcon className="h-8 w-8 text-brand-accent-light" />
        </div>
      </div>

      <h2 className="text-center text-2xl font-bold">Enable Cloud Sync?</h2>

      <p className="text-center text-sm text-content-secondary">
        Cloud sync allows you to securely backup and access your chats across
        multiple devices with end-to-end encryption.
      </p>

      <div className="space-y-3">
        <div className="flex items-start space-x-3">
          <LockClosedIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-accent-light" />
          <div>
            <p className="text-sm font-medium text-content-primary">
              End-to-End Encrypted
            </p>
            <p className="text-xs text-content-muted">
              All chats are encrypted before leaving your device
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-3">
          <KeyIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-accent-light" />
          <div>
            <p className="text-sm font-medium text-content-primary">
              You Control Your Key
            </p>
            <p className="text-xs text-content-muted">
              Only you have access to your encryption key
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-chat p-3">
        <div>
          <div className="text-sm font-medium text-content-secondary">
            Enable Cloud Sync
          </div>
          <div className="text-xs text-content-muted">
            Turn off to keep all chats local only
          </div>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={cloudSyncEnabled}
            onChange={(e) => handleEnableToggle(e.target.checked)}
            className="peer sr-only"
          />
          <div className="peer h-6 w-11 rounded-full border border-border-subtle bg-content-muted/40 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-content-muted/70 after:shadow-sm after:transition-all after:content-[''] peer-checked:bg-brand-accent-light peer-checked:after:translate-x-full peer-checked:after:bg-white peer-focus:outline-none" />
        </label>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleMaybeLater}
          className="flex-1 rounded-lg border border-border-subtle bg-surface-chat px-4 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-chat/80"
        >
          Maybe later
        </button>
        <button
          onClick={handleContinue}
          className="flex-1 rounded-lg bg-brand-accent-dark px-4 py-2 text-sm font-medium text-content-inverse transition-colors hover:bg-brand-accent-dark/90"
        >
          Continue
        </button>
      </div>
    </div>
  )

  const renderGenerateOrRestoreStep = () => (
    <div className="space-y-4">
      <h2 className="text-center text-xl font-bold">Setup Encryption</h2>

      <p className="text-center text-sm text-content-secondary">
        Choose whether to generate a new encryption key or restore an existing
        one from another device.
      </p>

      <div className="space-y-3">
        <button
          onClick={handleGenerateKey}
          disabled={isProcessing}
          className="flex w-full items-start space-x-3 rounded-lg border border-border-subtle p-4 text-left transition-colors hover:bg-surface-chat/80"
        >
          <KeyIcon className="mt-0.5 h-6 w-6 flex-shrink-0 text-brand-accent-light" />
          <div className="flex-1">
            <p className="font-medium text-content-primary">Generate New Key</p>
            <p className="text-xs text-content-muted">
              Create a new encryption key for this device. Your existing chats
              will be encrypted and synced.
            </p>
          </div>
        </button>

        <button
          onClick={() => setCurrentStep('restore-key')}
          disabled={isProcessing}
          className="flex w-full items-start space-x-3 rounded-lg border border-border-subtle p-4 text-left transition-colors hover:bg-surface-chat/80"
        >
          <ArrowDownTrayIcon className="mt-0.5 h-6 w-6 flex-shrink-0 text-emerald-400" />
          <div className="flex-1">
            <p className="font-medium text-content-primary">
              Restore Existing Key
            </p>
            <p className="text-xs text-content-muted">
              Use an encryption key from another device to sync your existing
              chats.
            </p>
          </div>
        </button>
      </div>

      <button
        onClick={() => setCurrentStep('intro')}
        className="w-full rounded-lg border border-border-subtle bg-surface-chat px-4 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-chat/80"
      >
        Back
      </button>
    </div>
  )

  const renderKeyDisplayStep = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-center">
        <div className="rounded-full bg-emerald-500/20 p-3">
          <CheckIcon className="h-8 w-8 text-emerald-400" />
        </div>
      </div>

      <h2 className="text-center text-xl font-bold">
        Encryption Key Generated
      </h2>

      <p className="text-center text-sm text-content-secondary">
        Save this key securely. You&apos;ll need it to access your chats on
        other devices.
      </p>

      <div className="rounded-lg border border-border-subtle bg-surface-chat p-3">
        {generatedKey && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <code className="font-mono text-xs text-brand-accent-light">
                {generatedKey.substring(0, 30)}...
              </code>
              <div className="flex gap-2">
                <button
                  onClick={downloadKeyAsPEM}
                  className="rounded-lg bg-surface-chat p-2 text-content-primary transition-all hover:bg-surface-chat/80"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={handleCopyKey}
                  className={`rounded-lg p-2 transition-all ${
                    isCopied
                      ? 'bg-emerald-500 text-white'
                      : 'bg-surface-chat text-content-primary hover:bg-surface-chat/80'
                  }`}
                >
                  {isCopied ? (
                    <CheckIcon className="h-4 w-4" />
                  ) : (
                    <ArrowUpTrayIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="mt-3 flex justify-center rounded-lg bg-surface-card p-3">
              <QRCode
                value={generatedKey}
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
          </div>
        )}
      </div>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
        <p className="text-xs text-amber-600 dark:text-amber-400">
          <strong>Important:</strong> Store this key safely. Without it, you
          won&apos;t be able to decrypt your chats on other devices.
        </p>
      </div>

      <button
        onClick={handleComplete}
        className="w-full rounded-lg bg-brand-accent-dark px-4 py-2 text-sm font-medium text-content-inverse transition-colors hover:bg-brand-accent-dark/90"
      >
        Done
      </button>
    </div>
  )

  const renderRestoreKeyStep = () => (
    <div className="space-y-4">
      <h2 className="text-center text-xl font-bold">Restore Encryption Key</h2>

      <p className="text-center text-sm text-content-secondary">
        Enter or import your encryption key from another device.
      </p>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
          isDragging
            ? 'border-brand-accent-light bg-brand-accent-light/10'
            : 'border-border-subtle bg-surface-chat'
        }`}
      >
        <ArrowUpTrayIcon
          className={`mx-auto h-8 w-8 ${
            isDragging ? 'text-brand-accent-light' : 'text-content-muted'
          }`}
        />
        <p
          className={`mt-2 text-sm ${
            isDragging ? 'text-brand-accent-light' : 'text-content-muted'
          }`}
        >
          {isDragging
            ? 'Drop your PEM file here'
            : 'Drag and drop a PEM file here'}
        </p>
        {!isDragging && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pem"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 rounded-md border border-border-subtle bg-surface-input px-3 py-1.5 text-sm font-medium text-content-primary transition-colors hover:bg-surface-input/80"
            >
              Choose File
            </button>
          </>
        )}
      </div>

      <div className="space-y-2">
        <input
          type="password"
          value={inputKey}
          onChange={(e) => setInputKey(e.target.value)}
          placeholder="Enter encryption key (e.g., key_abc123...)"
          className="w-full rounded-lg border border-border-subtle bg-surface-input px-3 py-2 text-sm text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-brand-accent-light"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleRestoreKey()
            }
          }}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setCurrentStep('generate-or-restore')}
          className="flex-1 rounded-lg border border-border-subtle bg-surface-chat px-4 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-chat/80"
        >
          Back
        </button>
        <button
          onClick={handleRestoreKey}
          disabled={isProcessing || !inputKey.trim()}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            isProcessing || !inputKey.trim()
              ? 'cursor-not-allowed bg-surface-chat text-content-muted'
              : 'bg-emerald-500 text-white hover:bg-emerald-600'
          }`}
        >
          {isProcessing ? 'Restoring...' : 'Restore Key'}
        </button>
      </div>
    </div>
  )

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
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-surface-card p-6 text-left align-middle shadow-xl transition-all">
                {currentStep !== 'intro' && (
                  <button
                    onClick={onClose}
                    className="absolute right-4 top-4 rounded-lg p-1 text-content-secondary transition-colors hover:bg-surface-chat"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                )}

                {currentStep === 'intro' && renderIntroStep()}
                {currentStep === 'generate-or-restore' &&
                  renderGenerateOrRestoreStep()}
                {currentStep === 'key-display' && renderKeyDisplayStep()}
                {currentStep === 'restore-key' && renderRestoreKeyStep()}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
