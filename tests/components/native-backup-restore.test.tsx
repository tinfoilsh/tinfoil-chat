import { NativeBackupRestore } from '@/components/chat/native-backup-restore'
import type { NativeRestoreResult } from '@/services/native-backup/orchestrate'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const report = {
  projects: {
    imported: 1,
    skipped: 0,
    failed: 0,
    blocked: 0,
    warnings: [],
    errors: [],
  },
  project_documents: {
    imported: 0,
    skipped: 0,
    failed: 0,
    blocked: 0,
    warnings: [],
    errors: [],
  },
  cloud_chats: {
    imported: 0,
    skipped: 0,
    failed: 0,
    blocked: 0,
    warnings: [],
    errors: [],
  },
  local_chats: {
    imported: 1,
    skipped: 0,
    failed: 0,
    blocked: 0,
    warnings: [],
    errors: [],
  },
  attachments: {
    imported: 0,
    skipped: 0,
    failed: 0,
    blocked: 0,
    warnings: [],
    errors: [],
  },
} satisfies NativeRestoreResult['report']

function selectArchive(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]')!
  fireEvent.change(input, {
    target: { files: [new File(['backup'], 'backup.zip')] },
  })
}

describe('NativeBackupRestore', () => {
  it('honors its availability gate and displays the plaintext warning', () => {
    const { rerender } = render(
      <NativeBackupRestore available={false} ownerId="owner" />,
    )
    expect(
      screen.queryByRole('button', { name: 'Restore Tinfoil Backup' }),
    ).not.toBeInTheDocument()
    rerender(<NativeBackupRestore available ownerId="owner" />)
    expect(screen.getByText(/plaintext backup/)).toBeVisible()
  })

  it('reports partial restores by kind without unqualified success', async () => {
    const runRestore = vi.fn(async () => ({
      state: 'partial' as const,
      report: {
        ...report,
        attachments: {
          ...report.attachments,
          warnings: ['thumbnail unavailable'],
        },
      },
    }))
    const updated = vi.fn()
    const { container } = render(
      <NativeBackupRestore
        available
        ownerId="owner"
        runRestore={runRestore}
        onChatsUpdated={updated}
      />,
    )
    selectArchive(container)

    expect(
      await screen.findByText('Backup restored with warnings.'),
    ).toBeVisible()
    expect(
      screen.getByText(/attachments:.*thumbnail unavailable/i),
    ).toBeVisible()
    expect(screen.queryByText('Backup restored successfully.')).toBeNull()
    expect(updated).toHaveBeenCalledOnce()
  })

  it('reports a failed asynchronous chat reload instead of success', async () => {
    const runRestore = vi.fn(async () => ({
      state: 'completed' as const,
      report,
    }))
    const updated = vi.fn(async () => {
      throw new Error('Chat reload failed')
    })
    const { container } = render(
      <NativeBackupRestore
        available
        ownerId="owner"
        runRestore={runRestore}
        onChatsUpdated={updated}
      />,
    )

    selectArchive(container)

    expect(await screen.findByText('Chat reload failed')).toBeVisible()
    expect(screen.queryByText('Backup restored successfully.')).toBeNull()
  })

  it('explains pending local restore and allows cancellation', async () => {
    const runRestore = vi.fn(
      (_file: File, _owner: string, signal: AbortSignal) =>
        new Promise<NativeRestoreResult>((resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason))
          queueMicrotask(() => resolve({ state: 'pending', report }))
        }),
    )
    const first = render(
      <NativeBackupRestore available ownerId="owner" runRestore={runRestore} />,
    )
    selectArchive(first.container)
    expect(
      await screen.findByText(/No local chats were restored/),
    ).toHaveTextContent('reselect this archive')

    const neverFinishes = vi.fn(
      (_file: File, _owner: string, signal: AbortSignal) =>
        new Promise<NativeRestoreResult>((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason)),
        ),
    )
    first.unmount()
    const second = render(
      <NativeBackupRestore
        available
        ownerId="owner"
        runRestore={neverFinishes}
      />,
    )
    selectArchive(second.container)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(neverFinishes.mock.calls[0][2].aborted).toBe(true),
    )
  })

  it('closes without aborting after the enclave restore starts', async () => {
    let finish!: (result: NativeRestoreResult) => void
    const runRestore = vi.fn(
      (
        _file: File,
        _owner: string,
        _signal: AbortSignal,
        events: { onStarted(status: any): void },
      ) => {
        events.onStarted({ status: 'running', phase: 'projects' })
        return new Promise<NativeRestoreResult>((resolve) => (finish = resolve))
      },
    )
    const { container } = render(
      <NativeBackupRestore available ownerId="owner" runRestore={runRestore} />,
    )
    selectArchive(container)
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }))

    expect(runRestore.mock.calls[0][2].aborted).toBe(false)
    expect(screen.getByText(/enclave restore continues/i)).toHaveTextContent(
      "We'll email you",
    )
    finish({ state: 'pending', report })
  })

  it('aborts a started restore when its owner changes', async () => {
    const runRestore = vi.fn(
      (
        _file: File,
        _owner: string,
        signal: AbortSignal,
        events: { onStarted(status: any): void },
      ) => {
        events.onStarted({ status: 'running' })
        return new Promise<NativeRestoreResult>((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason)),
        )
      },
    )
    const view = render(
      <NativeBackupRestore
        available
        ownerId="owner-a"
        runRestore={runRestore}
      />,
    )
    selectArchive(view.container)
    await waitFor(() => expect(runRestore).toHaveBeenCalledOnce())

    view.rerender(
      <NativeBackupRestore
        available
        ownerId="owner-b"
        runRestore={runRestore}
      />,
    )

    expect(runRestore.mock.calls[0][2].aborted).toBe(true)
  })

  it('surfaces a terminal failure after the progress view is closed', async () => {
    let finish!: (result: NativeRestoreResult) => void
    const runRestore = vi.fn(
      (
        _file: File,
        _owner: string,
        _signal: AbortSignal,
        events: { onStarted(status: any): void },
      ) => {
        events.onStarted({ status: 'running' })
        return new Promise<NativeRestoreResult>((resolve) => (finish = resolve))
      },
    )
    const view = render(
      <NativeBackupRestore available ownerId="owner" runRestore={runRestore} />,
    )
    selectArchive(view.container)
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }))

    finish({ state: 'failed', report })

    expect(
      await screen.findByText(
        'The cloud restore failed. No local chats were restored.',
      ),
    ).toBeVisible()
  })

  it('replaces the dismissed progress message after completion', async () => {
    let finish!: (result: NativeRestoreResult) => void
    const runRestore = vi.fn(
      (
        _file: File,
        _owner: string,
        _signal: AbortSignal,
        events: { onStarted(status: any): void },
      ) => {
        events.onStarted({ status: 'running' })
        return new Promise<NativeRestoreResult>((resolve) => (finish = resolve))
      },
    )
    const view = render(
      <NativeBackupRestore available ownerId="owner" runRestore={runRestore} />,
    )
    selectArchive(view.container)
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }))

    finish({ state: 'completed', report })

    expect(
      await screen.findByText('Backup restored successfully.'),
    ).toBeVisible()
  })
})
