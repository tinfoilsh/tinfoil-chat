import {
  nativeBackupExportError,
  runNativeBackupExport,
  type NativeBackupExportProgress,
} from '@/services/native-backup/export'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from './components/confirm-dialog'

const progressLabel: Record<NativeBackupExportProgress, string> = {
  collecting: 'Collecting cloud data...',
  formatting: 'Formatting backup...',
  writing: 'Saving archive...',
}

export function NativeBackupExport({
  available,
  runExport = runNativeBackupExport,
}: {
  available: boolean
  runExport?: typeof runNativeBackupExport
}) {
  const [showWarning, setShowWarning] = useState(false)
  const [progress, setProgress] = useState<NativeBackupExportProgress | null>(
    null,
  )
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  const createBackup = async () => {
    setShowWarning(false)
    setMessage(null)
    setFailed(false)
    const current = new AbortController()
    controller.current = current
    try {
      await runExport(current.signal, setProgress)
      setMessage('Backup saved successfully.')
    } catch (error) {
      setFailed(true)
      setMessage(nativeBackupExportError(error))
    } finally {
      if (controller.current === current) controller.current = null
      setProgress(null)
    }
  }

  if (!available) return null

  return (
    <div>
      <div className="rounded-lg border border-border-subtle bg-surface-sidebar p-4">
        <p className="font-aeonik-fono text-xs text-content-muted">
          Export your cloud and local data as a portable ZIP archive.
        </p>
        <button
          type="button"
          onClick={() => setShowWarning(true)}
          disabled={progress !== null}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border-subtle px-4 py-2.5 text-sm font-medium transition-colors hover:bg-surface-chat disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          Create Tinfoil Backup
        </button>
        {progress && (
          <div
            className="mt-3 flex items-center justify-between gap-3 text-xs text-content-muted"
            role="status"
          >
            <span>{progressLabel[progress]}</span>
            <button
              type="button"
              onClick={() => controller.current?.abort()}
              className="font-medium text-content-primary hover:underline"
            >
              Cancel
            </button>
          </div>
        )}
        {message && (
          <p
            role="status"
            className={`mt-3 text-xs ${failed ? 'text-red-500' : 'text-content-primary'}`}
          >
            {message}
          </p>
        )}
      </div>
      <ConfirmDialog
        isOpen={showWarning}
        title="Export readable backup?"
        description="This ZIP is plaintext and readable by anyone who can access it. It contains sensitive chats, documents, and images. Store it securely."
        confirmLabel="I understand, create backup"
        onConfirm={() => void createBackup()}
        onCancel={() => setShowWarning(false)}
      />
    </div>
  )
}
