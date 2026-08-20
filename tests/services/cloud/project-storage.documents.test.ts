import { ProjectStorageService } from '@/services/cloud/project-storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  accountGuard: {
    assertCurrent: vi.fn(),
    isCurrent: vi.fn(() => true),
    userId: 'user-1',
  },
  canWriteToCloud: vi.fn().mockResolvedValue(true),
  enclaveDeleteAllProjects: vi.fn(),
  enclavePull: vi.fn(),
  enclavePush: vi.fn(),
  enclaveListStatus: vi.fn(),
  pullItemPlaintext: vi.fn(),
}))

vi.mock('@/services/auth', () => ({
  authTokenManager: { getToken: vi.fn() },
}))

vi.mock('@/services/cloud/cloud-key-authorization', () => ({
  canWriteToCloud: mocks.canWriteToCloud,
}))

vi.mock('@/services/cloud/cloud-sync', () => ({
  cloudSync: { createAccountOperationGuard: () => mocks.accountGuard },
}))

vi.mock('@/services/cloud/cek-encoding', () => ({
  pullKey: () => [{ key: 'primary-key' }],
  requirePrimaryKeyB64: () => 'primary-key',
}))

vi.mock('@/services/sync-enclave/sync-api', () => ({
  deleteAllProjects: mocks.enclaveDeleteAllProjects,
  deleteRow: vi.fn(),
  listStatus: mocks.enclaveListStatus,
  pull: mocks.enclavePull,
  push: mocks.enclavePush,
  newIdempotencyKey: () => 'idempotency-key',
  pullItemPlaintext: mocks.pullItemPlaintext,
}))

vi.mock('@/utils/error-handling', () => ({
  logError: vi.fn(),
}))

describe('ProjectStorageService documents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('persists and restores the original file size', async () => {
    const storage = new ProjectStorageService()
    vi.spyOn(storage, 'generateDocumentId').mockResolvedValue({
      documentId: 'doc-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      reverseTimestamp: 1,
    })
    mocks.enclavePush.mockResolvedValue({ etag: '1' })

    const document = await storage.uploadDocument(
      'project-1',
      'notes.pdf',
      'application/pdf',
      'Extracted text',
      8192,
    )

    const pushRequest = mocks.enclavePush.mock.calls[0][0]
    const payload = JSON.parse(new TextDecoder().decode(pushRequest.plaintext))
    expect(payload.sizeBytes).toBe(8192)
    expect(document.sizeBytes).toBe(8192)

    mocks.enclavePull.mockResolvedValue({
      items: [{ id: 'project-1/doc-1', ok: true, etag: '1' }],
    })
    mocks.pullItemPlaintext.mockReturnValue(pushRequest.plaintext)
    const restored = await storage.getDocuments('project-1', ['doc-1'])
    expect(restored.get('doc-1')?.sizeBytes).toBe(8192)
  })

  it('deletes every project with one atomic enclave call', async () => {
    const storage = new ProjectStorageService()
    mocks.enclaveDeleteAllProjects.mockResolvedValue({ ok: true, deleted: 7 })

    await expect(storage.deleteAllProjects()).resolves.toEqual({
      ok: true,
      deleted: 7,
    })
    expect(mocks.enclaveDeleteAllProjects).toHaveBeenCalledOnce()
    expect(mocks.accountGuard.assertCurrent).toHaveBeenCalledTimes(2)
    expect(mocks.enclaveDeleteAllProjects).toHaveBeenCalledWith({
      keyB64: 'primary-key',
      idempotencyKey: 'idempotency-key',
    })
    expect(mocks.enclaveListStatus).not.toHaveBeenCalled()
  })

  it('does not delete projects after the active account changes', async () => {
    const storage = new ProjectStorageService()
    mocks.accountGuard.assertCurrent.mockImplementationOnce(() => {
      throw new Error('Cloud account changed during synchronization')
    })

    await expect(storage.deleteAllProjects()).rejects.toThrow(
      'Cloud account changed',
    )

    expect(mocks.enclaveDeleteAllProjects).not.toHaveBeenCalled()
  })

  it('derives a size when reading legacy document payloads', async () => {
    const storage = new ProjectStorageService()
    const content = 'R\u00e9sum\u00e9'
    mocks.enclavePull.mockResolvedValue({
      items: [{ id: 'project-1/doc-1', ok: true, etag: '1' }],
    })
    mocks.pullItemPlaintext.mockReturnValue(
      new TextEncoder().encode(
        JSON.stringify({
          content,
          filename: 'notes.txt',
          contentType: 'text/plain',
        }),
      ),
    )

    const documents = await storage.getDocuments('project-1', ['doc-1'])

    expect(documents.get('doc-1')?.sizeBytes).toBe(
      new TextEncoder().encode(content).length,
    )
  })

  it('deduplicates documents listed on multiple pages', async () => {
    const storage = new ProjectStorageService()
    // Simulates a row whose updated_at was bumped mid-walk (enclave
    // rewrap-on-pull), so the same id appears on two pages.
    mocks.enclaveListStatus
      .mockResolvedValueOnce({
        updates: [
          {
            id: 'project-1/doc-1',
            etag: '1',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'project-1/doc-2',
            etag: '1',
            updated_at: '2026-01-01T00:00:01.000Z',
          },
        ],
        next_cursor: 'page-2',
      })
      .mockResolvedValueOnce({
        updates: [
          {
            id: 'project-1/doc-1',
            etag: '2',
            updated_at: '2026-01-01T00:00:02.000Z',
          },
          // Stale copy arriving after the fresher page-1 row: the
          // freshest copy must win, not the last occurrence.
          {
            id: 'project-1/doc-2',
            etag: '0',
            updated_at: '2025-12-31T00:00:00.000Z',
          },
        ],
        next_cursor: undefined,
      })

    const { documents } = await storage.listDocuments('project-1')

    // The freshest copy of each row wins, ordered by updated_at.
    expect(
      documents.map((doc) => ({ id: doc.id, updatedAt: doc.updatedAt })),
    ).toEqual([
      { id: 'doc-2', updatedAt: '2026-01-01T00:00:01.000Z' },
      { id: 'doc-1', updatedAt: '2026-01-01T00:00:02.000Z' },
    ])
  })

  it('excludes other projects\u2019 documents from the listing', async () => {
    const storage = new ProjectStorageService()
    mocks.enclaveListStatus.mockResolvedValueOnce({
      updates: [
        {
          id: 'project-1/doc-1',
          etag: '1',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'project-2/doc-9',
          etag: '1',
          updated_at: '2026-01-01T00:00:01.000Z',
        },
      ],
      next_cursor: undefined,
    })

    const { documents } = await storage.listDocuments('project-1')

    expect(documents).toHaveLength(1)
    expect(documents[0]).toMatchObject({ id: 'doc-1', projectId: 'project-1' })
  })

  it('marks failed pulls as unavailable documents', async () => {
    const storage = new ProjectStorageService()
    mocks.enclavePull.mockResolvedValue({
      items: [
        {
          id: 'project-1/doc-1',
          ok: false,
          code: 'UNKNOWN_KEY',
        },
      ],
    })

    const documents = await storage.getDocuments('project-1', ['doc-1'])

    expect(documents.get('doc-1')).toMatchObject({
      id: 'doc-1',
      projectId: 'project-1',
      decryptionFailed: true,
    })
  })
})
