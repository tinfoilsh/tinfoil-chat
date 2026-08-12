import { ACCOUNT_RESET_FAILED_EVENT } from '@/constants/auth-events'
import {
  AUTH_ACCOUNT_RESET_FAILED,
  AUTH_ACCOUNT_RESET_SIGNAL,
} from '@/constants/storage-keys'
import {
  handleIndexedDBAccountResetStorageEvent,
  IndexedDBStorage,
} from '@/services/storage/indexed-db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeResetTransaction {
  oncomplete: (() => void) | null
  onerror: (() => void) | null
  onabort: (() => void) | null
  abort: ReturnType<typeof vi.fn>
  objectStore: (storeName: string) => {
    clear: ReturnType<typeof vi.fn>
  }
}

describe('IndexedDBStorage account reset', () => {
  function prepareReset(storage: IndexedDBStorage) {
    const clear = vi.fn(() => ({ onerror: null }))
    const clearProjects = vi.fn(() => ({ onerror: null }))
    const clearPayloads = vi.fn(() => ({ onerror: null }))
    const clearSummaries = vi.fn(() => ({ onerror: null }))
    const transaction: FakeResetTransaction = {
      oncomplete: null,
      onerror: null,
      onabort: null,
      abort: vi.fn(),
      objectStore: (storeName) => ({
        clear:
          storeName === 'chats'
            ? clear
            : storeName === 'projects'
              ? clearProjects
              : storeName === 'attachmentPayloads'
                ? clearPayloads
                : clearSummaries,
      }),
    }
    const resetDb = {
      transaction: vi.fn(() => transaction),
    }
    vi.spyOn(storage as any, 'ensureDB').mockResolvedValue(resetDb)
    return {
      clear,
      clearProjects,
      clearPayloads,
      clearSummaries,
      transaction,
    }
  }

  async function completeReset(transaction: FakeResetTransaction) {
    await vi.waitFor(() => expect(transaction.oncomplete).not.toBeNull())
    transaction.oncomplete?.()
  }

  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('bypasses a stalled write queue and closes the old connection', async () => {
    const storage = new IndexedDBStorage()
    const { clear, clearProjects, clearPayloads, clearSummaries, transaction } =
      prepareReset(storage)
    const close = vi.fn()
    Object.assign(storage as any, {
      db: { close },
      saveQueue: new Promise(() => {}),
    })

    const reset = storage.resetForAccountChange()

    expect(close).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(clear).toHaveBeenCalledTimes(1))
    expect(clearProjects).toHaveBeenCalledTimes(1)
    expect(clearPayloads).toHaveBeenCalledTimes(1)
    expect(clearSummaries).toHaveBeenCalledTimes(1)
    await completeReset(transaction)
    await reset
  })

  it('coalesces concurrent account reset requests', async () => {
    const storage = new IndexedDBStorage()
    const { clear, transaction } = prepareReset(storage)

    const firstReset = storage.resetForAccountChange()
    const secondReset = storage.resetForAccountChange()

    await vi.waitFor(() => expect(clear).toHaveBeenCalledTimes(1))
    await completeReset(transaction)
    await Promise.all([firstReset, secondReset])

    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('resets storage when another tab signals an account change', async () => {
    const storage = new IndexedDBStorage()
    const reset = vi
      .spyOn(storage, 'resetForAccountChange')
      .mockResolvedValue(undefined)
    const reload = vi
      .spyOn(window.location, 'reload')
      .mockImplementation(() => {})
    sessionStorage.setItem(AUTH_ACCOUNT_RESET_FAILED, 'true')

    handleIndexedDBAccountResetStorageEvent(
      storage,
      new StorageEvent('storage', {
        key: AUTH_ACCOUNT_RESET_SIGNAL,
        newValue: 'reset_123',
      }),
    )

    expect(reset).toHaveBeenCalledWith(false)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(sessionStorage.getItem(AUTH_ACCOUNT_RESET_FAILED)).toBeNull()
  })

  it('reports cross-tab reset failures without re-enabling writes', async () => {
    const storage = new IndexedDBStorage()
    vi.spyOn(storage, 'resetForAccountChange').mockRejectedValue(
      new Error('reset failed'),
    )
    const handleFailure = vi.fn()
    window.addEventListener(ACCOUNT_RESET_FAILED_EVENT, handleFailure)

    handleIndexedDBAccountResetStorageEvent(
      storage,
      new StorageEvent('storage', {
        key: AUTH_ACCOUNT_RESET_SIGNAL,
        newValue: 'reset_123',
      }),
    )

    await vi.waitFor(() => expect(handleFailure).toHaveBeenCalledTimes(1))
    expect(sessionStorage.getItem(AUTH_ACCOUNT_RESET_FAILED)).toBe('true')
    window.removeEventListener(ACCOUNT_RESET_FAILED_EVENT, handleFailure)
  })

  it('cancels writes that were queued before the account reset', async () => {
    const storage = new IndexedDBStorage()
    const { transaction } = prepareReset(storage)
    let releaseQueue!: () => void
    const stalledQueue = new Promise<void>((resolve) => {
      releaseQueue = resolve
    })
    Object.assign(storage as any, { saveQueue: stalledQueue })
    const saveInternal = vi
      .spyOn(storage as any, 'saveChatInternal')
      .mockResolvedValue(undefined)

    const save = storage.saveChat({
      id: 'chat_123',
      title: 'Old account chat',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any)
    const reset = storage.resetForAccountChange()
    await completeReset(transaction)
    await reset

    releaseQueue()

    await expect(save).rejects.toThrow(
      'IndexedDB write superseded by account change',
    )
    expect(saveInternal).not.toHaveBeenCalled()
  })

  it('rejects writes submitted after the account reset starts', async () => {
    const storage = new IndexedDBStorage()
    const { transaction } = prepareReset(storage)
    const saveInternal = vi
      .spyOn(storage as any, 'saveChatInternal')
      .mockResolvedValue(undefined)
    const reset = storage.resetForAccountChange()

    const save = storage.saveChat({
      id: 'chat_123',
      title: 'Old account chat',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any)

    await expect(save).rejects.toThrow(
      'IndexedDB write superseded by account change',
    )
    await completeReset(transaction)
    await reset

    await expect(
      storage.saveChat({
        id: 'chat_456',
        title: 'Late old account chat',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any),
    ).rejects.toThrow('IndexedDB write superseded by account change')
    expect(saveInternal).not.toHaveBeenCalled()
  })

  it('rejects reads after an account reset starts', async () => {
    const storage = new IndexedDBStorage()
    const { transaction } = prepareReset(storage)
    const reset = storage.resetForAccountChange()

    await expect(storage.getAllChats()).rejects.toThrow(
      'IndexedDB read superseded by account change',
    )
    await expect(storage.getProjectsForUser('user_123')).rejects.toThrow(
      'IndexedDB read superseded by account change',
    )

    await completeReset(transaction)
    await reset
  })

  it('rejects reads waiting behind a stalled save queue when reset starts', async () => {
    const storage = new IndexedDBStorage()
    Object.assign(storage as any, { saveQueue: new Promise(() => {}) })
    const read = storage.getAllChats()
    const { transaction } = prepareReset(storage)

    const reset = storage.resetForAccountChange()

    await expect(read).rejects.toThrow(
      'IndexedDB read superseded by account change',
    )
    await completeReset(transaction)
    await reset
  })

  it('rejects reads that were already in flight when reset started', async () => {
    const storage = new IndexedDBStorage()
    let finishRead!: (value: string) => void
    const protectedRead = (storage as any).protectRead(
      new Promise<string>((resolve) => {
        finishRead = resolve
      }),
    )
    const { transaction } = prepareReset(storage)

    const reset = storage.resetForAccountChange()
    finishRead('stale data')

    await expect(protectedRead).rejects.toThrow(
      'IndexedDB read superseded by account change',
    )
    await completeReset(transaction)
    await reset
  })

  it('rejects a final write after reset interrupts a multi-stage mutation', async () => {
    const storage = new IndexedDBStorage()
    let finishRead!: (chat: any) => void
    const getChat = vi
      .spyOn(storage as any, 'getStoredChatInternal')
      .mockReturnValue(
        new Promise((resolve) => {
          finishRead = resolve
        }),
      )

    const update = storage.updateChatProject('chat_123', 'project_123')
    await vi.waitFor(() => expect(getChat).toHaveBeenCalledTimes(1))
    const { transaction } = prepareReset(storage)
    const reset = storage.resetForAccountChange()

    finishRead({
      id: 'chat_123',
      title: 'Old account chat',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastAccessedAt: Date.now(),
    })

    await expect(update).rejects.toThrow(
      'IndexedDB write superseded by account change',
    )
    await completeReset(transaction)
    await reset
  })

  it('aborts a stalled reset transaction before rejecting', async () => {
    vi.useFakeTimers()
    const storage = new IndexedDBStorage()
    const { transaction } = prepareReset(storage)

    const reset = storage.resetForAccountChange()
    const rejection = expect(reset).rejects.toThrow(
      'Timed out resetting IndexedDB for account change',
    )

    await vi.runAllTimersAsync()

    await rejection
    expect(transaction.abort).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed stored chats instead of leaving reads pending', async () => {
    const storage = new IndexedDBStorage()
    const cursorRequest = {
      onsuccess: null,
      onerror: null,
    } as {
      onsuccess: ((event: unknown) => void) | null
      onerror: (() => void) | null
    }
    const openCursor = vi.fn(() => cursorRequest)
    const payloadRequest = { onsuccess: null, onerror: null, result: [] }
    const transaction = {
      oncomplete: null,
      objectStore: (storeName: string) =>
        storeName === 'chats'
          ? { openCursor }
          : { getAll: () => payloadRequest },
    }
    vi.spyOn(storage as any, 'ensureDB').mockResolvedValue({
      transaction: () => transaction,
    })

    const chats = storage.getAllChats()
    await vi.waitFor(() => expect(cursorRequest.onsuccess).not.toBeNull())

    cursorRequest.onsuccess?.({
      target: {
        result: {
          value: { id: 'broken_chat', messages: null },
          continue: vi.fn(),
        },
      },
    })

    await expect(chats).rejects.toThrow('Stored chat has invalid messages')
  })
})
