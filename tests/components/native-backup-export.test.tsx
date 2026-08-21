import { NativeBackupExport } from '@/components/chat/native-backup-export'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('NativeBackupExport', () => {
  it('hides export when its account, flag, or key gate is unavailable', () => {
    render(<NativeBackupExport available={false} />)
    expect(
      screen.queryByRole('button', { name: 'Create Tinfoil Backup' }),
    ).not.toBeInTheDocument()
  })

  it('requires plaintext confirmation before export', async () => {
    const runExport = vi.fn(async () => undefined)
    render(<NativeBackupExport available runExport={runExport} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Create Tinfoil Backup' }),
    )
    expect(runExport).not.toHaveBeenCalled()
    expect(screen.getByText(/plaintext and readable/)).toHaveTextContent(
      'sensitive chats, documents, and images',
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'I understand, create backup' }),
    )
    await waitFor(() => expect(runExport).toHaveBeenCalledOnce())
    expect(await screen.findByText('Backup saved successfully.')).toBeVisible()
  })

  it('cancels an active export with its AbortController', async () => {
    const runExport = vi.fn(
      (signal: AbortSignal, onProgress: (value: 'collecting') => void) => {
        onProgress('collecting')
        return new Promise<void>((_resolve, reject) =>
          signal.addEventListener('abort', () =>
            reject(new DOMException('Canceled', 'AbortError')),
          ),
        )
      },
    )
    render(<NativeBackupExport available runExport={runExport} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Create Tinfoil Backup' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'I understand, create backup' }),
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(await screen.findByText(/No backup file was saved/)).toBeVisible()
    expect(runExport.mock.calls[0][0].aborted).toBe(true)
  })

  it('cancels an active export when availability is lost', async () => {
    const runExport = vi.fn(
      (signal: AbortSignal, onProgress: (value: 'collecting') => void) => {
        onProgress('collecting')
        return new Promise<void>((_resolve, reject) =>
          signal.addEventListener('abort', () =>
            reject(new DOMException('Canceled', 'AbortError')),
          ),
        )
      },
    )
    const view = render(<NativeBackupExport available runExport={runExport} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Create Tinfoil Backup' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'I understand, create backup' }),
    )
    await waitFor(() => expect(runExport).toHaveBeenCalledOnce())

    view.rerender(
      <NativeBackupExport available={false} runExport={runExport} />,
    )

    await waitFor(() => expect(runExport.mock.calls[0][0].aborted).toBe(true))
    view.rerender(<NativeBackupExport available runExport={runExport} />)
    expect(screen.queryByText(/No backup file was saved/)).toBeNull()
  })

  it('ignores stale completion from an invalidated export', async () => {
    let rejectFirst!: (reason: unknown) => void
    const runExport = vi
      .fn()
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
    const view = render(<NativeBackupExport available runExport={runExport} />)
    const start = () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Create Tinfoil Backup' }),
      )
      fireEvent.click(
        screen.getByRole('button', { name: 'I understand, create backup' }),
      )
    }
    start()
    await waitFor(() => expect(runExport).toHaveBeenCalledOnce())
    view.rerender(
      <NativeBackupExport available={false} runExport={runExport} />,
    )
    view.rerender(<NativeBackupExport available runExport={runExport} />)
    start()

    expect(await screen.findByText('Backup saved successfully.')).toBeVisible()
    rejectFirst(new DOMException('Canceled', 'AbortError'))
    await Promise.resolve()

    expect(screen.getByText('Backup saved successfully.')).toBeVisible()
  })
})
