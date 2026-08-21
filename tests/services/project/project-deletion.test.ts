import type { AccountOperationGuard } from '@/services/cloud/account-operation'
import { clearDeletedProjectsForAccount } from '@/services/project/project-deletion'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clear: vi.fn(),
  invalidateProjects: vi.fn(),
}))

vi.mock('@/services/storage/project-cache', () => ({
  projectCache: { clear: mocks.clear },
}))

vi.mock('@/services/project/project-events', () => ({
  invalidateProjects: mocks.invalidateProjects,
}))

describe('clearDeletedProjectsForAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not publish success when the account changes during cache clear', async () => {
    let accountIsCurrent = true
    let finishCacheClear!: () => void
    mocks.clear.mockReturnValue(
      new Promise<void>((resolve) => {
        finishCacheClear = resolve
      }),
    )
    const guard: AccountOperationGuard = {
      userId: 'project-user',
      isCurrent: () => accountIsCurrent,
      assertCurrent: vi.fn(() => {
        if (!accountIsCurrent) {
          throw new Error('Cloud account changed during synchronization')
        }
      }),
    }
    const onCacheError = vi.fn()
    const publishUiSuccess = vi.fn()

    const completion = clearDeletedProjectsForAccount(guard, onCacheError).then(
      publishUiSuccess,
    )
    await vi.waitFor(() => expect(mocks.clear).toHaveBeenCalledOnce())

    accountIsCurrent = false
    finishCacheClear()

    await expect(completion).rejects.toThrow(
      'Cloud account changed during synchronization',
    )
    expect(guard.assertCurrent).toHaveBeenCalledTimes(2)
    expect(mocks.invalidateProjects).not.toHaveBeenCalled()
    expect(publishUiSuccess).not.toHaveBeenCalled()
    expect(onCacheError).not.toHaveBeenCalled()
  })
})
