import { useCloudPagination } from '@/hooks/use-cloud-pagination'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchAndStorePage } = vi.hoisted(() => ({
  fetchAndStorePage: vi.fn(),
}))

vi.mock('@/services/cloud/cloud-sync', () => ({
  cloudSync: { fetchAndStorePage },
}))

vi.mock('@/utils/cloud-sync-settings', () => ({
  isCloudSyncEnabled: () => true,
}))

describe('useCloudPagination', () => {
  beforeEach(() => {
    fetchAndStorePage.mockReset().mockResolvedValue({
      hasMore: true,
      nextToken: 'page-3',
      saved: 20,
    })
  })

  it('loads the page after the initial sync token', async () => {
    const { result } = renderHook(() =>
      useCloudPagination({
        isSignedIn: true,
        userId: 'user-1',
        initialToken: 'page-2',
        isInitialPageReady: true,
      }),
    )

    await waitFor(() => expect(result.current.isInitialized).toBe(true))

    await act(() => result.current.loadMore())

    expect(fetchAndStorePage).toHaveBeenCalledWith({
      limit: 20,
      continuationToken: 'page-2',
    })
  })

  it('does not repeat the first page when it has no continuation token', async () => {
    const { result } = renderHook(() =>
      useCloudPagination({
        isSignedIn: true,
        userId: 'user-1',
        isInitialPageReady: true,
      }),
    )

    await waitFor(() => expect(result.current.isInitialized).toBe(true))

    await act(() => result.current.loadMore())

    expect(fetchAndStorePage).not.toHaveBeenCalled()
  })

  it('deduplicates concurrent requests for the same page', async () => {
    let resolvePage!: (value: {
      hasMore: boolean
      nextToken?: string
      saved: number
    }) => void
    fetchAndStorePage.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePage = resolve
      }),
    )
    const { result } = renderHook(() =>
      useCloudPagination({
        isSignedIn: true,
        userId: 'user-1',
        initialToken: 'page-2',
        isInitialPageReady: true,
      }),
    )
    await waitFor(() => expect(result.current.isInitialized).toBe(true))

    await act(async () => {
      const first = result.current.loadMore()
      const second = result.current.loadMore()
      expect(fetchAndStorePage).toHaveBeenCalledOnce()
      resolvePage({ hasMore: false, saved: 20 })
      await Promise.all([first, second])
    })
  })

  it('does not let an obsolete request unlock a newer request', async () => {
    let resolveOldPage!: (value: {
      hasMore: boolean
      nextToken?: string
      saved: number
    }) => void
    fetchAndStorePage.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOldPage = resolve
      }),
    )
    const { result, rerender } = renderHook(
      ({ userId, token }: { userId: string; token: string }) =>
        useCloudPagination({
          isSignedIn: true,
          userId,
          initialToken: token,
          isInitialPageReady: true,
        }),
      { initialProps: { userId: 'user-1', token: 'user-1-page-2' } },
    )
    await waitFor(() => expect(result.current.isInitialized).toBe(true))

    let oldRequest!: ReturnType<typeof result.current.loadMore>
    act(() => {
      oldRequest = result.current.loadMore()
    })
    rerender({ userId: 'user-2', token: 'user-2-page-2' })
    await waitFor(() => expect(result.current.isInitialized).toBe(true))

    await act(() => result.current.loadMore())
    resolveOldPage({ hasMore: false, saved: 20 })
    await act(() => oldRequest)

    expect(fetchAndStorePage).toHaveBeenCalledTimes(2)
    expect(fetchAndStorePage).toHaveBeenLastCalledWith({
      limit: 20,
      continuationToken: 'user-2-page-2',
    })
  })
})
