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

function indexingOutcome(): ChatSearchOutcome {
  return {
    results: [],
    totalIndexed: 0,
    indexing: true,
    available: true,
    reindexSettled: new Promise(() => {}),
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
    expect(result.current.results).toEqual([])
  })

  it('clears the indexing flag when resolving hits fails after needs_reindex', async () => {
    searchSyncedChats.mockResolvedValueOnce(indexingOutcome())
    resolveSearchResultChats.mockRejectedValueOnce(new Error('pull failed'))
    const { result } = renderHook(() => useChatSearch('duck', true))
    await flushDebounce()

    expect(result.current.isSearching).toBe(false)
    expect(result.current.isIndexing).toBe(false)
  })
})
