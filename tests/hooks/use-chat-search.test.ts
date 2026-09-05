import { useChatSearch } from '@/hooks/use-chat-search'
import type { ChatSearchOutcome } from '@/services/cloud/chat-search'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const searchSyncedChats = vi.fn()
const resolveSearchResultChats = vi.fn()

vi.mock('@/services/cloud/chat-search', () => ({
  searchSyncedChats: (...args: unknown[]) => searchSyncedChats(...args),
  resolveSearchResultChats: (...args: unknown[]) =>
    resolveSearchResultChats(...args),
}))

vi.mock('@/utils/error-handling', () => ({
  logError: vi.fn(),
}))

function indexingOutcome(
  reindexSettled: ChatSearchOutcome['reindexSettled'] = new Promise(() => {}),
): ChatSearchOutcome {
  return {
    results: [],
    totalIndexed: 0,
    indexing: true,
    available: true,
    reindexSettled,
  }
}

function readyOutcome(): ChatSearchOutcome {
  return {
    results: [],
    totalIndexed: 3,
    indexing: false,
    available: true,
    reindexSettled: null,
  }
}

async function flushDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400)
  })
}

describe('useChatSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    searchSyncedChats.mockReset()
    resolveSearchResultChats.mockReset()
    resolveSearchResultChats.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('clears the indexing flag when a later search run fails', async () => {
    searchSyncedChats.mockResolvedValueOnce(indexingOutcome())
    const { result, rerender } = renderHook(
      ({ term }) => useChatSearch(term, true),
      { initialProps: { term: 'duc' } },
    )
    await flushDebounce()
    expect(result.current.isIndexing).toBe(true)

    searchSyncedChats.mockRejectedValueOnce(new Error('enclave timeout'))
    rerender({ term: 'duck' })
    await flushDebounce()

    expect(result.current.isSearching).toBe(false)
    expect(result.current.isIndexing).toBe(false)
    expect(result.current.failed).toBe(true)
    expect(result.current.results).toEqual([])
  })

  it('clears the indexing flag when resolving hits fails after needs_reindex', async () => {
    searchSyncedChats.mockResolvedValueOnce(indexingOutcome())
    resolveSearchResultChats.mockRejectedValueOnce(new Error('pull failed'))
    const { result } = renderHook(() => useChatSearch('duck', true))
    await flushDebounce()

    expect(result.current.isSearching).toBe(false)
    expect(result.current.isIndexing).toBe(false)
    expect(result.current.failed).toBe(true)
  })

  it('marks the search failed when the rebuild it waited on does not complete', async () => {
    searchSyncedChats.mockResolvedValueOnce(
      indexingOutcome(Promise.resolve('failed')),
    )
    const { result } = renderHook(() => useChatSearch('duck', true))
    await flushDebounce()

    expect(result.current.isIndexing).toBe(false)
    expect(result.current.failed).toBe(true)
  })

  it('re-queries after a completed rebuild and clears the failed flag on success', async () => {
    searchSyncedChats
      .mockResolvedValueOnce(indexingOutcome(Promise.resolve('completed')))
      .mockResolvedValueOnce(readyOutcome())
    const { result } = renderHook(() => useChatSearch('duck', true))
    await flushDebounce()
    await flushDebounce()

    expect(searchSyncedChats).toHaveBeenCalledTimes(2)
    expect(result.current.isIndexing).toBe(false)
    expect(result.current.failed).toBe(false)
  })

  it('clears a previous failure when the term changes and the new run succeeds', async () => {
    searchSyncedChats
      .mockRejectedValueOnce(new Error('enclave timeout'))
      .mockResolvedValueOnce(readyOutcome())
    const { result, rerender } = renderHook(
      ({ term }) => useChatSearch(term, true),
      { initialProps: { term: 'duc' } },
    )
    await flushDebounce()
    expect(result.current.failed).toBe(true)

    rerender({ term: 'duck' })
    await flushDebounce()
    expect(result.current.failed).toBe(false)
  })
})
