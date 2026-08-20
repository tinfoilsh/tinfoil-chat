import { AuthTokenUnavailableError } from '@/services/auth'
import { NativeBackupCollectionError } from '@/services/native-backup/collect'
import {
  nativeBackupExportError,
  runNativeBackupExport,
  type NativeBackupExportDependencies,
} from '@/services/native-backup/export'
import { NativeBackupWriterError } from '@/services/native-backup/write'
import { SyncEnclaveError } from '@/services/sync-enclave'
import { describe, expect, it, vi } from 'vitest'

describe('native backup export orchestration', () => {
  it('collects, formats, commits, and only then downloads', async () => {
    const order: string[] = []
    const dependencies = {
      prepare: vi.fn(async () => {
        order.push('prepare')
        return undefined
      }),
      collect: vi.fn(async () => {
        order.push('collect')
        return { value: true }
      }),
      format: vi.fn(() => {
        order.push('format')
        return { manifestBytes: new Uint8Array(), files: [] }
      }),
      write: vi.fn(async () => {
        order.push('write')
        return { kind: 'file', filename: 'backup.zip' } as const
      }),
      download: vi.fn(() => order.push('download')),
    } as unknown as NativeBackupExportDependencies
    const progress: string[] = []

    await runNativeBackupExport(
      new AbortController().signal,
      (value) => progress.push(value),
      dependencies,
    )

    expect(order).toEqual(['prepare', 'collect', 'format', 'write', 'download'])
    expect(progress).toEqual(['collecting', 'formatting', 'writing'])
    expect(dependencies.collect).toHaveBeenCalledWith(expect.any(AbortSignal))
  })

  it('does not format or download after cancellation', async () => {
    const controller = new AbortController()
    const dependencies = {
      prepare: vi.fn(async () => undefined),
      collect: vi.fn(async () => {
        controller.abort()
        return {}
      }),
      format: vi.fn(),
      write: vi.fn(),
      download: vi.fn(),
    } as unknown as NativeBackupExportDependencies

    await expect(
      runNativeBackupExport(controller.signal, vi.fn(), dependencies),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(dependencies.format).not.toHaveBeenCalled()
    expect(dependencies.download).not.toHaveBeenCalled()
  })

  it('returns actionable errors for expected failures', () => {
    expect(
      nativeBackupExportError(
        new NativeBackupCollectionError('cloud chat', 'chat-1', 'missing'),
      ),
    ).toContain('changed or went missing')
    expect(
      nativeBackupExportError(
        new NativeBackupWriterError('compressed_limit', 'too large'),
      ),
    ).toContain('too large')
    expect(
      nativeBackupExportError(new DOMException('Denied', 'NotAllowedError')),
    ).toContain('Allow file downloads')
    expect(
      nativeBackupExportError(new DOMException('Canceled', 'AbortError')),
    ).toContain('No backup file was saved')
    expect(
      nativeBackupExportError(
        new NativeBackupCollectionError('account', 'active', 'unavailable'),
      ),
    ).toContain('Sign in again')
    expect(
      nativeBackupExportError(
        new NativeBackupCollectionError('account', 'user-1', 'locked'),
      ),
    ).toContain('Unlock your cloud encryption key')
    expect(
      nativeBackupExportError(new AuthTokenUnavailableError('unavailable')),
    ).toContain('Sign in again')
    expect(nativeBackupExportError(new SyncEnclaveError('', 401))).toContain(
      'Sign in again',
    )
  })
})
