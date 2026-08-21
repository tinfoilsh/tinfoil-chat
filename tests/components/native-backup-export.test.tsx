import { NativeBackupExport } from '@/components/chat/native-backup-export'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ runExport: vi.fn() }))
vi.mock('@/services/native-backup/export', () => ({
  runNativeBackupExport: mocks.runExport,
  nativeBackupExportError: (error: unknown) =>
    error instanceof DOMException && error.name === 'AbortError'
      ? 'Backup canceled. No backup file was saved.'
      : 'Backup failed.',
}))

describe('NativeBackupExport', () => {
  beforeEach(() => {
    mocks.runExport.mockReset()
  })

  it('hides export when an availability prerequisite is missing', () => {
    render(<NativeBackupExport available={false} />)
    expect(
      screen.queryByRole('button', { name: 'Create Tinfoil Backup' }),
    ).not.toBeInTheDocument()
  })

  it('requires plaintext confirmation before export', async () => {
    mocks.runExport.mockResolvedValue(undefined)
    render(<NativeBackupExport available />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Create Tinfoil Backup' }),
    )
    expect(mocks.runExport).not.toHaveBeenCalled()
    expect(screen.getByText(/plaintext and readable/)).toHaveTextContent(
      'sensitive chats, documents, and images',
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'I understand, create backup' }),
    )
    await waitFor(() => expect(mocks.runExport).toHaveBeenCalledOnce())
    expect(await screen.findByText('Backup saved successfully.')).toBeVisible()
  })

  it('cancels an active export with its AbortController', async () => {
    mocks.runExport.mockImplementation(
      (signal: AbortSignal, onProgress: (value: 'collecting') => void) => {
        onProgress('collecting')
        return new Promise<void>((_resolve, reject) =>
          signal.addEventListener('abort', () =>
            reject(new DOMException('Canceled', 'AbortError')),
          ),
        )
      },
    )
    render(<NativeBackupExport available />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Create Tinfoil Backup' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'I understand, create backup' }),
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(await screen.findByText(/No backup file was saved/)).toBeVisible()
    expect(mocks.runExport.mock.calls[0][0].aborted).toBe(true)
  })

  it('cancels an active export when availability is lost', async () => {
    mocks.runExport.mockImplementation(
      (signal: AbortSignal, onProgress: (value: 'collecting') => void) => {
        onProgress('collecting')
        return new Promise<void>((_resolve, reject) =>
          signal.addEventListener('abort', () =>
            reject(new DOMException('Canceled', 'AbortError')),
          ),
        )
      },
    )
    const view = render(<NativeBackupExport available />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Create Tinfoil Backup' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'I understand, create backup' }),
    )
    await waitFor(() => expect(mocks.runExport).toHaveBeenCalledOnce())

    view.rerender(<NativeBackupExport available={false} />)

    await waitFor(() =>
      expect(mocks.runExport.mock.calls[0][0].aborted).toBe(true),
    )
    view.rerender(<NativeBackupExport available />)
    expect(screen.queryByText(/No backup file was saved/)).toBeNull()
  })

  it('ignores stale completion from an invalidated export', async () => {
    let rejectFirst!: (reason: unknown) => void
    mocks.runExport
      .mockImplementationOnce(
        (signal: AbortSignal, onProgress: (value: 'collecting') => void) => {
          onProgress('collecting')
          return new Promise<void>((_resolve, reject) => {
            rejectFirst = reject
            signal.addEventListener('abort', () => undefined)
          })
        },
      )
      .mockResolvedValueOnce(undefined)
    const view = render(<NativeBackupExport available />)
    const start = () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Create Tinfoil Backup' }),
      )
      fireEvent.click(
        screen.getByRole('button', { name: 'I understand, create backup' }),
      )
    }
    start()
    await waitFor(() => expect(mocks.runExport).toHaveBeenCalledOnce())
    view.rerender(<NativeBackupExport available={false} />)
    view.rerender(<NativeBackupExport available />)
    start()

    expect(await screen.findByText('Backup saved successfully.')).toBeVisible()
    rejectFirst(new DOMException('Canceled', 'AbortError'))
    await Promise.resolve()

    expect(screen.getByText('Backup saved successfully.')).toBeVisible()
  })
})
