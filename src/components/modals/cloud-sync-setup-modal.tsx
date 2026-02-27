import { SETTINGS_HAS_SEEN_CLOUD_SYNC_MODAL } from '@/constants/storage-keys'
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
  ChevronDownIcon,
  CloudArrowUpIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
  KeyIcon,
  LockClosedIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { GoPasskeyFill } from 'react-icons/go'
import QRCode from 'react-qr-code'

interface CloudSyncSetupModalBaseProps {
  isOpen: boolean
  onClose: () => void
  onSetupComplete: (encryptionKey: string) => void
  isDarkMode: boolean
  initialCloudSyncEnabled?: boolean
}

type CloudSyncSetupModalProps = CloudSyncSetupModalBaseProps &
  (
    | {
        passkeyRecoveryNeeded: true
        onRecoverWithPasskey: () => Promise<boolean>
        onSetupNewKey?: () => Promise<boolean>
      }
    | {
        passkeyRecoveryNeeded?: false
        onRecoverWithPasskey?: () => Promise<boolean>
        onSetupNewKey?: () => Promise<boolean>
      }
  )

type SetupStep =
  | 'intro'
  | 'generate-or-restore'
  | 'key-display'
  | 'restore-key'
  | 'passkey-recovery'

export function CloudSyncSetupModal({
  isOpen,
  onClose,
  onSetupComplete,
  isDarkMode,
  initialCloudSyncEnabled = false,
  passkeyRecoveryNeeded = false,
  onRecoverWithPasskey,
  onSetupNewKey,
}: CloudSyncSetupModalProps) {
  const [currentStep, setCurrentStep] = useState<SetupStep>(
    passkeyRecoveryNeeded ? 'passkey-recovery' : 'intro',
  )
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(
    initialCloudSyncEnabled,
  )
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [inputKey, setInputKey] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isRecovering, setIsRecovering] = useState(false)
  const [recoveryFailed, setRecoveryFailed] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isQRCodeExpanded, setIsQRCodeExpanded] = useState(false)
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
    localStorage.setItem(SETTINGS_HAS_SEEN_CLOUD_SYNC_MODAL, 'true')
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
      localStorage.setItem(SETTINGS_HAS_SEEN_CLOUD_SYNC_MODAL, 'true')

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
    localStorage.setItem(SETTINGS_HAS_SEEN_CLOUD_SYNC_MODAL, 'true')
    if (generatedKey) {
      onSetupComplete(generatedKey)
    }
    onClose()
  }

  const renderIntroStep = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-center">
        <div className="rounded-full bg-content-muted/20 p-3">
          <CloudArrowUpIcon className="h-8 w-8 text-content-secondary" />
        </div>
      </div>

      <p className="text-center text-xs font-medium uppercase tracking-wide text-content-muted">
        Step 1
      </p>
      <h2 className="text-center text-2xl font-bold">Enable Cloud Sync?</h2>

      <p className="text-sm text-content-secondary">
        Cloud sync enables encrypted syncing of chats and projects across your
        devices.
      </p>

      <div className="space-y-3">
        <div className="flex items-start space-x-3">
          <LockClosedIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-content-secondary" />
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
          <KeyIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-content-secondary" />
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
        <div className="text-sm font-medium text-content-secondary">
          Enable Cloud Sync
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
          className="flex-1 rounded-lg bg-brand-accent-dark px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-accent-dark/90"
        >
          Continue
        </button>
      </div>
    </div>
  )

  const renderGenerateOrRestoreStep = () => (
    <div className="space-y-4">
      <p className="text-center text-xs font-medium uppercase tracking-wide text-content-muted">
        Step 2
      </p>
      <h2 className="text-center text-xl font-bold">Encryption Key</h2>

      <p className="text-sm text-content-secondary">
        Generate a new personal encryption key or restore an existing one. Your
        chats will be encrypted and synced with this personal key.
      </p>

      <button
        onClick={() => setCurrentStep('restore-key')}
        disabled={isProcessing}
        className="w-full rounded-lg border border-border-subtle bg-surface-chat px-4 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-chat/80"
      >
        Restore Encryption Key
      </button>

      <div className="flex gap-2">
        <button
          onClick={() => setCurrentStep('intro')}
          className="flex-1 rounded-lg border border-border-subtle bg-surface-chat px-4 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-chat/80"
        >
          Back
        </button>
        <button
          onClick={handleGenerateKey}
          disabled={isProcessing}
          className="flex-1 rounded-lg bg-brand-accent-dark px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-accent-dark/90"
        >
          {isProcessing ? 'Generating...' : 'Generate Key'}
        </button>
      </div>
    </div>
  )

  const renderKeyDisplayStep = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-center">
        <div className="rounded-full bg-emerald-500/20 p-3">
          <CheckIcon className="h-8 w-8 text-emerald-400" />
        </div>
      </div>

      <h2 className="text-center text-xl font-bold">Success!</h2>

      <p className="text-center text-sm text-content-secondary">
        Save this key securely. You&apos;ll need it to access your chats and
        projects on other devices.
      </p>

      <div className="rounded-lg border border-border-subtle bg-surface-chat p-3">
        {generatedKey && (
          <div className="flex items-center justify-between gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-blue-500">
              {generatedKey.substring(0, 20)}...
            </code>
            <div className="flex flex-shrink-0 gap-2">
              <button
                onClick={downloadKeyAsPEM}
                className="rounded-lg bg-surface-chat p-2 text-content-primary transition-all hover:bg-surface-chat/80"
                title="Download as PEM file"
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
                title="Copy to clipboard"
              >
                {isCopied ? (
                  <CheckIcon className="h-4 w-4" />
                ) : (
                  <DocumentDuplicateIcon className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {generatedKey && (
        <div className="rounded-lg border border-border-subtle">
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
          )}
        </div>
      )}

      <button
        onClick={handleComplete}
        className="w-full rounded-lg bg-brand-accent-dark px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-accent-dark/90"
      >
        Done
      </button>
    </div>
  )

  const renderRestoreKeyStep = () => (
    <div className="space-y-4">
      <h2 className="text-center text-xl font-bold">Restore Encryption Key</h2>

      <p className="text-center text-sm text-content-secondary">
        Enter or upload your personal encryption key.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!isProcessing && inputKey.trim()) {
            handleRestoreKey()
          }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="space-y-2"
        id="encryption-key-form"
      >
        <div className="flex gap-2">
          <input
            type="hidden"
            name="username"
            autoComplete="username"
            value="encryption-key"
            readOnly
          />
          <input
            type="password"
            name="password"
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            placeholder="Enter encryption key"
            autoComplete="current-password"
            className="flex-1 rounded-lg border border-blue-500 bg-surface-input px-3 py-2 text-sm text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".pem"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-border-subtle bg-surface-chat p-2 text-content-primary transition-colors hover:bg-surface-chat/80"
            title="Upload PEM file"
          >
            <ArrowUpTrayIcon className="h-5 w-5" />
          </button>
        </div>
        {isDragging && (
          <p className="text-center text-sm text-blue-500">
            Drop your PEM file here
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCurrentStep('generate-or-restore')}
            className="flex-1 rounded-lg border border-border-subtle bg-surface-chat px-4 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-chat/80"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={isProcessing || !inputKey.trim()}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              isProcessing || !inputKey.trim()
                ? 'cursor-not-allowed bg-surface-chat text-content-muted'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {isProcessing ? 'Restoring...' : 'Restore Key'}
          </button>
        </div>
      </form>
    </div>
  )

  const [isStartingFresh, setIsStartingFresh] = useState(false)

  const handlePasskeyRecovery = async () => {
    if (!onRecoverWithPasskey) return
    setIsRecovering(true)
    setRecoveryFailed(false)
    try {
      const success = await onRecoverWithPasskey()
      if (success) {
        onClose()
      } else {
        setRecoveryFailed(true)
      }
    } catch (error) {
      logError('Passkey recovery failed', error, {
        component: 'CloudSyncSetupModal',
        action: 'handlePasskeyRecovery',
      })
      setRecoveryFailed(true)
    } finally {
      setIsRecovering(false)
    }
  }

  const handleStartFresh = async () => {
    if (!onSetupNewKey) return
    setIsStartingFresh(true)
    try {
      const success = await onSetupNewKey()
      if (success) {
        onClose()
      }
    } catch (error) {
      logError('Start fresh failed', error, {
        component: 'CloudSyncSetupModal',
        action: 'handleStartFresh',
      })
    } finally {
      setIsStartingFresh(false)
    }
  }

  const renderPasskeyRecoveryStep = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-center">
        <div className="rounded-full bg-content-muted/20 p-3">
          <GoPasskeyFill className="h-8 w-8 text-content-secondary" />
        </div>
      </div>

      <h2 className="text-center text-xl font-bold">Unlock Your Chats</h2>

      <p className="text-sm text-content-secondary">
        Your encrypted chats are stored in the cloud. Authenticate with your
        passkey to recover your encryption key on this device.
      </p>

      {recoveryFailed && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Passkey authentication failed. You can try again or enter your
            encryption key manually.
          </p>
        </div>
      )}

      <button
        onClick={handlePasskeyRecovery}
        disabled={isRecovering}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-accent-dark px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-accent-dark/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <GoPasskeyFill className="h-4 w-4" />
        {isRecovering ? 'Authenticating...' : 'Unlock with Passkey'}
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border-subtle" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-surface-card px-2 text-content-muted">or</span>
        </div>
      </div>

      <button
        onClick={() => setCurrentStep('restore-key')}
        disabled={isRecovering || isStartingFresh}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-chat px-4 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-chat/80"
      >
        <KeyIcon className="h-4 w-4" />
        Enter Key Manually
      </button>

      {onSetupNewKey && (
        <button
          onClick={handleStartFresh}
          disabled={isRecovering || isStartingFresh}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-chat px-4 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-chat/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isStartingFresh ? 'Creating...' : 'Start Fresh with New Key'}
        </button>
      )}

      <button
        onClick={onClose}
        disabled={isRecovering || isStartingFresh}
        className="text-sm text-content-muted transition-colors hover:text-content-secondary"
      >
        Skip for Now
      </button>
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
                {currentStep !== 'intro' &&
                  currentStep !== 'passkey-recovery' && (
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
                {currentStep === 'passkey-recovery' &&
                  renderPasskeyRecoveryStep()}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
