import { ProjectStorageService } from '@/services/cloud/project-storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  canWriteToCloud: vi.fn(),
  deleteAllProjects: vi.fn(),
  newIdempotencyKey: vi.fn(),
  requirePrimaryKeyB64: vi.fn(),
}))

vi.mock('@/services/auth', () => ({
  authTokenManager: {},
}))

vi.mock('@/services/cloud/cloud-key-authorization', () => ({
  canWriteToCloud: mocks.canWriteToCloud,
}))

vi.mock('@/services/cloud/cek-encoding', () => ({
  pullKey: vi.fn(),
  requirePrimaryKeyB64: mocks.requirePrimaryKeyB64,
}))

vi.mock('@/services/sync-enclave/sync-api', () => ({
  deleteAllProjects: mocks.deleteAllProjects,
  deleteRow: vi.fn(),
  listStatus: vi.fn(),
  pull: vi.fn(),
  push: vi.fn(),
  newIdempotencyKey: mocks.newIdempotencyKey,
  pullItemPlaintext: vi.fn(),
}))

describe('ProjectStorageService.deleteAllProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.canWriteToCloud.mockResolvedValue(true)
    mocks.requirePrimaryKeyB64.mockReturnValue('current-cek')
    mocks.newIdempotencyKey.mockReturnValue('delete-projects-idempotency')
    mocks.deleteAllProjects.mockResolvedValue({ ok: true, deleted: 4 })
  })

  it('deletes all projects in one atomic enclave request', async () => {
    const storage = new ProjectStorageService()

    await expect(storage.deleteAllProjects()).resolves.toBe(4)
    expect(mocks.deleteAllProjects).toHaveBeenCalledOnce()
    expect(mocks.deleteAllProjects).toHaveBeenCalledWith({
      keyB64: 'current-cek',
      idempotencyKey: 'delete-projects-idempotency',
    })
    expect(mocks.requirePrimaryKeyB64).toHaveBeenCalledOnce()
    expect(mocks.newIdempotencyKey).toHaveBeenCalledOnce()
  })

  it('does not request deletion when cloud writes are blocked', async () => {
    mocks.canWriteToCloud.mockResolvedValue(false)
    const storage = new ProjectStorageService()

    await expect(storage.deleteAllProjects()).rejects.toThrow(
      'Cloud writes are blocked until your encryption key is verified',
    )
    expect(mocks.deleteAllProjects).not.toHaveBeenCalled()
  })
})
