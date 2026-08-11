import { ProjectStorageService } from '@/services/cloud/project-storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enclavePull: vi.fn(),
  enclavePush: vi.fn(),
  pullItemPlaintext: vi.fn(),
}))

vi.mock('@/services/auth', () => ({
  authTokenManager: { getToken: vi.fn() },
}))

vi.mock('@/services/cloud/cloud-key-authorization', () => ({
  canWriteToCloud: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/services/cloud/cek-encoding', () => ({
  pullKey: () => [{ key: 'primary-key' }],
  requirePrimaryKeyB64: () => 'primary-key',
}))

vi.mock('@/services/sync-enclave/sync-api', () => ({
  deleteRow: vi.fn(),
  listStatus: vi.fn(),
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
