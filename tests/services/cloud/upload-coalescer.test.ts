/**
 * Upload Coalescer Tests
 */

import { UploadCoalescer } from '@/services/cloud/upload-coalescer'
import { SyncEnclaveError } from '@/services/sync-enclave/sync-enclave-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock error handling
vi.mock('@/utils/error-handling', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}))

type AttemptImpl = (chatId: string, idempotencyKey: string) => Promise<void>

// Adapts a per-attempt mock to the coalescer's prepare contract: the
// prepare mock resolves to a frozen attempt closure delegating to
// `attemptFn`, mirroring how cloud-sync snapshots a chat once and
// returns an attempt bound to that snapshot.
function prepareWith(attemptFn: AttemptImpl) {
  return vi.fn(
    async (chatId: string, idempotencyKey: string) => () =>
      attemptFn(chatId, idempotencyKey),
  )
}

describe('UploadCoalescer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Basic enqueue behavior', () => {
    it('prepares and runs the upload attempt when enqueued', async () => {
      const attemptFn = vi.fn().mockResolvedValue(undefined)
      const prepareFn = prepareWith(attemptFn)
      const coalescer = new UploadCoalescer(prepareFn)

      coalescer.enqueue('chat-1')

      // Let the async worker run
      await vi.runAllTimersAsync()

      expect(prepareFn).toHaveBeenCalledWith('chat-1', expect.any(String))
      expect(prepareFn).toHaveBeenCalledTimes(1)
      expect(attemptFn).toHaveBeenCalledTimes(1)
    })

    it('handles multiple different chats in parallel', async () => {
      const attemptFn = vi.fn().mockResolvedValue(undefined)
      const prepareFn = prepareWith(attemptFn)
      const coalescer = new UploadCoalescer(prepareFn)

      coalescer.enqueue('chat-1')
      coalescer.enqueue('chat-2')
      coalescer.enqueue('chat-3')

      await vi.runAllTimersAsync()

      expect(attemptFn).toHaveBeenCalledTimes(3)
      expect(prepareFn).toHaveBeenCalledWith('chat-1', expect.any(String))
      expect(prepareFn).toHaveBeenCalledWith('chat-2', expect.any(String))
      expect(prepareFn).toHaveBeenCalledWith('chat-3', expect.any(String))
    })

    it('completes without an attempt when prepare returns null', async () => {
      const prepareFn = vi.fn().mockResolvedValue(null)
      const coalescer = new UploadCoalescer(prepareFn)

      const wait = coalescer.enqueueAndWait('chat-1')
      await vi.runAllTimersAsync()

      await expect(wait).resolves.toBeUndefined()
      expect(prepareFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('§9.6 R1 — idempotency key ownership', () => {
    it('reuses the same idempotency key and frozen payload across retries of one logical write', async () => {
      const attemptFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('flake'))
        .mockRejectedValueOnce(new Error('flake'))
        .mockResolvedValueOnce(undefined)
      const prepareFn = prepareWith(attemptFn)

      const coalescer = new UploadCoalescer(prepareFn, {
        baseDelayMs: 10,
        maxDelayMs: 40,
        maxRetries: 3,
      })

      coalescer.enqueue('chat-1')
      await vi.runAllTimersAsync()

      expect(attemptFn).toHaveBeenCalledTimes(3)
      const keys = attemptFn.mock.calls.map((c) => c[1])
      expect(new Set(keys).size).toBe(1)
      // The payload is prepared once and every retry replays it, so
      // the enclave sees byte-identical bytes under the same key
      // instead of a re-read snapshot that could have changed.
      expect(prepareFn).toHaveBeenCalledTimes(1)
    })

    it('replays the frozen snapshot even when the source changes between retries', async () => {
      let source = 'v1'
      const seenPayloads: string[] = []
      const prepareFn = vi.fn(async () => {
        const snapshot = source
        return async () => {
          seenPayloads.push(snapshot)
          if (seenPayloads.length === 1) throw new Error('flake')
        }
      })

      const coalescer = new UploadCoalescer(prepareFn, {
        baseDelayMs: 10,
        maxRetries: 2,
      })

      coalescer.enqueue('chat-1')
      await vi.advanceTimersByTimeAsync(0) // First attempt fails
      source = 'v2' // An edit lands between attempts
      await vi.runAllTimersAsync()

      // The retry replays the snapshot captured at prepare time, not
      // the mutated source — that byte-identity is what lets the
      // enclave replay a committed-but-lost write instead of failing
      // with IDEMPOTENCY_CONFLICT.
      expect(seenPayloads).toEqual(['v1', 'v1'])
    })

    it('re-runs prepare when prepare itself fails before freezing a payload', async () => {
      const attemptFn = vi.fn().mockResolvedValue(undefined)
      const prepareFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('flake'))
        .mockImplementation(
          async (chatId: string, idempotencyKey: string) => () =>
            attemptFn(chatId, idempotencyKey),
        )

      const coalescer = new UploadCoalescer(prepareFn, {
        baseDelayMs: 10,
        maxRetries: 3,
      })

      coalescer.enqueue('chat-1')
      await vi.runAllTimersAsync()

      expect(prepareFn).toHaveBeenCalledTimes(2)
      expect(attemptFn).toHaveBeenCalledTimes(1)
      // Still one logical write: both prepare calls carry the same key
      expect(prepareFn.mock.calls[0][1]).toBe(prepareFn.mock.calls[1][1])
    })

    it('mints a fresh idempotency key for each new logical write', async () => {
      let resolveFirst: () => void
      const attemptFn = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              resolveFirst = resolve
            }),
        )
        .mockResolvedValueOnce(undefined)
      const prepareFn = prepareWith(attemptFn)

      const coalescer = new UploadCoalescer(prepareFn)

      coalescer.enqueue('chat-1')
      // Let prepare resolve so the first attempt is in flight
      await vi.advanceTimersByTimeAsync(0)
      // Dirty during in-flight — second logical write.
      coalescer.enqueue('chat-1')

      resolveFirst!()
      await vi.runAllTimersAsync()

      expect(attemptFn).toHaveBeenCalledTimes(2)
      const firstKey = attemptFn.mock.calls[0][1]
      const secondKey = attemptFn.mock.calls[1][1]
      expect(firstKey).not.toBe(secondKey)
    })
  })

  describe('Coalescing behavior', () => {
    it('waits for an existing upload without scheduling another write', async () => {
      let resolveUpload: (() => void) | undefined
      const uploadFn = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveUpload = resolve
          }),
      )
      const coalescer = new UploadCoalescer(uploadFn)
      coalescer.enqueue('chat-1')

      const ensured = coalescer.ensureUploadAndWait('chat-1')
      resolveUpload?.()
      await ensured

      expect(uploadFn).toHaveBeenCalledOnce()
    })

    it('coalesces rapid enqueues for the same chat', async () => {
      let resolveUpload: () => void
      const uploadPromise = new Promise<void>((resolve) => {
        resolveUpload = resolve
      })
      const attemptFn = vi.fn().mockReturnValue(uploadPromise)
      const prepareFn = prepareWith(attemptFn)
      const coalescer = new UploadCoalescer(prepareFn)

      // First enqueue starts upload
      coalescer.enqueue('chat-1')
      await vi.advanceTimersByTimeAsync(0)

      // These should be coalesced since upload is in progress
      coalescer.enqueue('chat-1')
      coalescer.enqueue('chat-1')
      coalescer.enqueue('chat-1')

      // Still only one upload started
      expect(attemptFn).toHaveBeenCalledTimes(1)
      expect(coalescer.isUploading('chat-1')).toBe(true)

      // Complete first upload
      resolveUpload!()
      await vi.runAllTimersAsync()

      // Dirty flag was set, so one more upload
      expect(attemptFn).toHaveBeenCalledTimes(2)
    })

    it('re-uploads after dirty flag set during upload', async () => {
      let resolveFirst: () => void
      let resolveSecond: () => void

      const attemptFn = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              resolveFirst = resolve
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              resolveSecond = resolve
            }),
        )
      const prepareFn = prepareWith(attemptFn)

      const coalescer = new UploadCoalescer(prepareFn)

      // Start first upload
      coalescer.enqueue('chat-1')
      await vi.advanceTimersByTimeAsync(0)
      expect(attemptFn).toHaveBeenCalledTimes(1)

      // Enqueue during upload - sets dirty flag
      coalescer.enqueue('chat-1')
      expect(attemptFn).toHaveBeenCalledTimes(1) // Still just one

      // Complete first upload
      resolveFirst!()
      await vi.runAllTimersAsync()

      // Second upload should have started
      expect(attemptFn).toHaveBeenCalledTimes(2)

      // Complete second upload
      resolveSecond!()
      await vi.runAllTimersAsync()

      // No more uploads (dirty flag was clear)
      expect(attemptFn).toHaveBeenCalledTimes(2)
    })
  })

  describe('Retry behavior', () => {
    it('retries failed uploads with exponential backoff', async () => {
      const attemptFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined)
      const prepareFn = prepareWith(attemptFn)

      // Pin the jitter to its upper bound so the retry windows are
      // deterministic. With full-jitter exponential backoff
      // delay = floor(random() * min(maxDelay, baseDelay * 2**attempt)),
      // random()=0.9999 gives the worst-case wait per attempt.
      const coalescer = new UploadCoalescer(prepareFn, {
        baseDelayMs: 100,
        maxDelayMs: 400,
        maxRetries: 3,
        scheduler: {
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          random: () => 0.9999,
        },
      })

      coalescer.enqueue('chat-1')

      // First attempt fails immediately
      await vi.advanceTimersByTimeAsync(0)
      expect(attemptFn).toHaveBeenCalledTimes(1)

      // Wait for first retry: max delay window = baseDelay * 2**0 = 100ms.
      await vi.advanceTimersByTimeAsync(100)
      expect(attemptFn).toHaveBeenCalledTimes(2)

      // Wait for second retry: max delay window = baseDelay * 2**1 = 200ms.
      await vi.advanceTimersByTimeAsync(200)
      expect(attemptFn).toHaveBeenCalledTimes(3)

      // All done
      await vi.runAllTimersAsync()
      expect(attemptFn).toHaveBeenCalledTimes(3)
    })

    it('gives up after max retries', async () => {
      const attemptFn = vi
        .fn()
        .mockRejectedValue(new Error('Permanent failure'))
      const prepareFn = prepareWith(attemptFn)

      const coalescer = new UploadCoalescer(prepareFn, {
        baseDelayMs: 100,
        maxRetries: 2,
      })

      coalescer.enqueue('chat-1')

      await vi.runAllTimersAsync()

      // 1 initial + 2 retries = 3 total attempts
      expect(attemptFn).toHaveBeenCalledTimes(3)
    })

    it('rejects enqueueAndWait after retries are exhausted', async () => {
      const attemptFn = vi
        .fn()
        .mockRejectedValue(new Error('Permanent failure'))
      const coalescer = new UploadCoalescer(prepareWith(attemptFn), {
        baseDelayMs: 100,
        maxRetries: 1,
      })

      const uploadPromise = coalescer.enqueueAndWait('chat-1')
      const expectation =
        expect(uploadPromise).rejects.toThrow('Permanent failure')
      await vi.runAllTimersAsync()

      await expectation
    })

    it('surfaces sync conflicts without retrying under the same idempotency key', async () => {
      const attemptFn = vi
        .fn()
        .mockRejectedValue(
          new SyncEnclaveError('SYNC_CONFLICT', 409, 'SYNC_CONFLICT'),
        )
      const coalescer = new UploadCoalescer(prepareWith(attemptFn), {
        baseDelayMs: 100,
        maxRetries: 3,
      })

      const uploadPromise = coalescer.enqueueAndWait('chat-1')
      const expectation = expect(uploadPromise).rejects.toMatchObject({
        code: 'SYNC_CONFLICT',
      })
      await vi.runAllTimersAsync()

      await expectation
      expect(attemptFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('State tracking', () => {
    it('tracks pending uploads correctly', async () => {
      const attemptFn = vi.fn().mockResolvedValue(undefined)
      const coalescer = new UploadCoalescer(prepareWith(attemptFn))

      expect(coalescer.hasPendingUpload('chat-1')).toBe(false)

      coalescer.enqueue('chat-1')

      // Right after enqueue, dirty flag is set
      expect(coalescer.hasPendingUpload('chat-1')).toBe(true)

      // Let the upload complete
      await vi.runAllTimersAsync()

      // After completion, state should be cleaned up
      expect(coalescer.hasPendingUpload('chat-1')).toBe(false)
      expect(coalescer.activeUploadCount).toBe(0)
    })

    it('returns pending chat IDs', async () => {
      const attemptFn = vi.fn().mockReturnValue(new Promise(() => {})) // Never resolves
      const coalescer = new UploadCoalescer(prepareWith(attemptFn))

      coalescer.enqueue('chat-1')
      coalescer.enqueue('chat-2')

      const pendingIds = coalescer.getPendingChatIds()

      expect(pendingIds).toContain('chat-1')
      expect(pendingIds).toContain('chat-2')
      expect(pendingIds).toHaveLength(2)
    })

    it('clears all state', async () => {
      const attemptFn = vi.fn().mockReturnValue(new Promise(() => {}))
      const coalescer = new UploadCoalescer(prepareWith(attemptFn))

      coalescer.enqueue('chat-1')
      coalescer.enqueue('chat-2')

      expect(coalescer.activeUploadCount).toBe(2)

      coalescer.clear()

      expect(coalescer.activeUploadCount).toBe(0)
      expect(coalescer.getPendingChatIds()).toHaveLength(0)
    })

    it('cancels waiters and retries when cleared during backoff', async () => {
      const attemptFn = vi.fn().mockRejectedValue(new Error('Network error'))
      const coalescer = new UploadCoalescer(prepareWith(attemptFn), {
        baseDelayMs: 1000,
        maxRetries: 3,
        scheduler: {
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          random: () => 0.9999,
        },
      })

      const upload = coalescer.enqueueAndWait('chat-1')
      await vi.advanceTimersByTimeAsync(0)
      expect(attemptFn).toHaveBeenCalledTimes(1)

      coalescer.clear()
      await expect(upload).rejects.toThrow('account change')
      await vi.advanceTimersByTimeAsync(1000)

      expect(attemptFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('Edge cases', () => {
    it('handles synchronous upload success', async () => {
      const attemptFn = vi.fn().mockResolvedValue(undefined)
      const coalescer = new UploadCoalescer(prepareWith(attemptFn))

      coalescer.enqueue('chat-1')
      await vi.runAllTimersAsync()

      expect(attemptFn).toHaveBeenCalledTimes(1)
      expect(coalescer.hasPendingUpload('chat-1')).toBe(false)
    })

    it('finishes a frozen retry before uploading newer dirty state', async () => {
      let source = 'v1'
      const attempts: Array<{ payload: string; idempotencyKey: string }> = []
      const prepareFn = vi.fn(
        async (_chatId: string, idempotencyKey: string) => {
          const payload = source
          return async () => {
            attempts.push({ payload, idempotencyKey })
            if (attempts.length === 1) throw new Error('Fail')
          }
        },
      )

      // Pin the jitter to its upper bound so the backoff window is
      // deterministic. A random delay of 0 would let the first retry
      // fire inside advanceTimersByTimeAsync(0) below — before the
      // enqueue during backoff — completing the worker and triggering
      // an extra upload.
      const coalescer = new UploadCoalescer(prepareFn, {
        baseDelayMs: 1000,
        maxRetries: 3,
        scheduler: {
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          random: () => 0.9999,
        },
      })

      coalescer.enqueue('chat-1')
      await vi.advanceTimersByTimeAsync(0) // First attempt fails

      // Enqueue during backoff
      source = 'v2'
      coalescer.enqueue('chat-1')

      // Advance to trigger retry
      await vi.advanceTimersByTimeAsync(1000)

      await vi.runAllTimersAsync()

      expect(attempts.map((attempt) => attempt.payload)).toEqual([
        'v1',
        'v1',
        'v2',
      ])
      expect(prepareFn).toHaveBeenCalledTimes(2)
      expect(attempts[0].idempotencyKey).toBe(attempts[1].idempotencyKey)
      expect(attempts[2].idempotencyKey).not.toBe(attempts[1].idempotencyKey)
    })
  })
})
