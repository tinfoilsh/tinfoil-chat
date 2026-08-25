import { ChatError } from '@/components/chat/chat-utils'
import type { PendingRecoveryEnvelope } from '@/components/chat/types'
import type { AguiEvent, RunStorage } from '@/services/inference/agui/protocol'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const decryptRecoveryEnvelope = vi.fn()
const encryptRecoveryEnvelope = vi.fn()
const rewrapRecoveryEnvelope = vi.fn()
const dropRun = vi.fn()
const resumeRun = vi.fn()
const addPendingRecovery = vi.fn()
const completePendingRecovery = vi.fn()
const removePendingRecovery = vi.fn()
const replacePendingRecovery = vi.fn()
const resetChatRecoverySyncState = vi.fn()
const clearChatRecoveryDrafts = vi.fn()
const clearActiveChatRecoveries = vi.fn()
const getChatRecoveryDraft = vi.fn()
const pruneChatRecoveryDrafts = vi.fn()
const setChatRecoveryActive = vi.fn()
const setChatRecoveryDraft = vi.fn()
const retryDeferredAlternativesFinalization = vi.fn()
const generateTitle = vi.fn()
const getPendingChatRecoveries = vi.fn()
const getChat = vi.fn()
let storedAlternatives: string[] = []
let cloudSyncEnabled = true

const { RunGoneError } = vi.hoisted(() => ({
  RunGoneError: class RunGoneError extends Error {
    constructor(message = 'not a recoverable run') {
      super(message)
      this.name = 'RunGoneError'
    }
  },
}))

vi.mock('@/services/inference/chat-recovery-crypto', () => ({
  decryptRecoveryEnvelope: (...args: unknown[]) =>
    decryptRecoveryEnvelope(...args),
  encryptRecoveryEnvelope: (...args: unknown[]) =>
    encryptRecoveryEnvelope(...args),
  rewrapRecoveryEnvelope: (...args: unknown[]) =>
    rewrapRecoveryEnvelope(...args),
}))

vi.mock('@/services/inference/agui/client', () => ({
  RunGoneError,
  dropRun: (...args: unknown[]) => dropRun(...args),
  resumeRun: (...args: unknown[]) => resumeRun(...args),
}))

vi.mock('@/services/inference/chat-recovery-sync', () => ({
  addPendingRecovery: (...args: unknown[]) => addPendingRecovery(...args),
  completePendingRecovery: (...args: unknown[]) =>
    completePendingRecovery(...args),
  removePendingRecovery: (...args: unknown[]) => removePendingRecovery(...args),
  replacePendingRecovery: (...args: unknown[]) =>
    replacePendingRecovery(...args),
  resetChatRecoverySyncState: () => resetChatRecoverySyncState(),
  sameRecoveredResponse: (
    existing: { content?: string },
    recovered: { content?: string },
  ) => existing.content === recovered.content,
}))

vi.mock('@/services/inference/chat-recovery-drafts', () => ({
  clearActiveChatRecoveries: () => clearActiveChatRecoveries(),
  clearChatRecoveryDrafts: () => clearChatRecoveryDrafts(),
  getChatRecoveryDraft: (...args: unknown[]) => getChatRecoveryDraft(...args),
  pruneChatRecoveryDrafts: (...args: unknown[]) =>
    pruneChatRecoveryDrafts(...args),
  setChatRecoveryActive: (...args: unknown[]) => setChatRecoveryActive(...args),
  setChatRecoveryDraft: (...args: unknown[]) => setChatRecoveryDraft(...args),
}))

vi.mock('@/services/cloud/legacy-blob-migration', () => ({
  retryDeferredAlternativesFinalization: () =>
    retryDeferredAlternativesFinalization(),
}))

vi.mock('@/services/inference/title', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/inference/title')>()),
  generateTitle: (...args: unknown[]) => generateTitle(...args),
}))

vi.mock('@/services/encryption/encryption-service', () => ({
  encryptionService: {
    getKeyBytesOrThrow: () => new Uint8Array(32),
    getStoredAlternatives: () => storedAlternatives,
    getAlternativeKeyBytes: () => new Uint8Array(32).fill(1),
  },
}))

vi.mock('@/services/storage/indexed-db', () => ({
  indexedDBStorage: {
    getPendingChatRecoveries: () => getPendingChatRecoveries(),
    getChat: (...args: unknown[]) => getChat(...args),
  },
}))

vi.mock('@/utils/cloud-sync-settings', () => ({
  isCloudSyncEnabled: () => cloudSyncEnabled,
}))

vi.mock('@/utils/error-handling', () => ({
  logError: vi.fn(),
}))

import {
  abandonChatRecoveryAttempt,
  cancelChatRecovery,
  markChatRecoveryTurnCancelled,
  persistChatRecoveryEnvelope,
  resetChatRecoveryState,
  scanPendingChatRecoveries,
  startChatRecoveryAttempt,
} from '@/services/inference/chat-recovery'

const STORAGE: RunStorage = {
  storageId: '0123456789abcdef0123456789abcdef',
  resumeSecret: 'fedcba9876543210fedcba9876543210',
}
const OTHER_STORAGE: RunStorage = {
  storageId: 'abcdefabcdefabcdefabcdefabcdefab',
  resumeSecret: '00112233445566778899aabbccddeeff',
}
const RECOVERY_SCAN_MAX_AGE_MS = 120_000
const envelope: PendingRecoveryEnvelope = {
  v: 1,
  turnId: 'turn-1',
  keyId: '0123456789abcdef0123456789abcdef',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  nonce: 'AAAAAAAAAAAAAAAA',
  ciphertext: 'AAAAAAAAAAAAAAAAAAAAAAAA',
}

/** The frames a run of `deltas` produces, ending as the given run ends. */
function frames(
  deltas: string[],
  end: 'RUN_FINISHED' | 'RUN_ERROR' = 'RUN_FINISHED',
): AguiEvent[] {
  return [
    { type: 'RUN_STARTED', threadId: 'chat-1', runId: 'turn-1' },
    ...deltas.map((delta): AguiEvent => ({
      type: 'TEXT_MESSAGE_CHUNK',
      messageId: 'msg-1',
      delta,
    })),
    end === 'RUN_FINISHED'
      ? { type: 'RUN_FINISHED' }
      : { type: 'RUN_ERROR', message: 'the run did not survive' },
  ]
}

/** A replay that serves those frames and ends, the way a stored log does. */
function replays(events: AguiEvent[]) {
  return async function* () {
    for (const event of events) yield event
  }
}

/** A replay that serves what it has and then waits to be let go. */
function replaysThenHangs(events: AguiEvent[]) {
  return async function* (_storage: RunStorage, signal: AbortSignal) {
    for (const event of events) yield event
    await new Promise((_resolve, reject) => {
      const abort = () => reject(new DOMException('Aborted', 'AbortError'))
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    })
  }
}

function pendingChat(recoveries: unknown[] = [envelope]) {
  getPendingChatRecoveries.mockResolvedValue([
    { id: 'chat-1', pendingRecoveries: recoveries },
  ])
  decryptRecoveryEnvelope.mockResolvedValue(STORAGE)
}

async function persistActiveRecovery(): Promise<void> {
  encryptRecoveryEnvelope.mockResolvedValueOnce(envelope)
  startChatRecoveryAttempt('chat-1', 'turn-1', STORAGE)
  await persistChatRecoveryEnvelope({
    userId: 'user-1',
    chatId: 'chat-1',
    turnId: 'turn-1',
    storage: STORAGE,
  })
}

describe('chat recovery lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getChatRecoveryDraft.mockReset()
    resumeRun.mockReset()
    resetChatRecoveryState()
    storedAlternatives = []
    cloudSyncEnabled = true
    getChat.mockResolvedValue({ id: 'chat-1', isLocalOnly: false })
    generateTitle.mockResolvedValue('Untitled')
    dropRun.mockResolvedValue(undefined)
    removePendingRecovery.mockResolvedValue(undefined)
    addPendingRecovery.mockResolvedValue(undefined)
    completePendingRecovery.mockResolvedValue(undefined)
    replacePendingRecovery.mockResolvedValue(undefined)
    retryDeferredAlternativesFinalization.mockResolvedValue(undefined)
  })

  it('suppresses an envelope registered after explicit cancellation', async () => {
    startChatRecoveryAttempt('chat-1', 'turn-1', STORAGE)
    const cancellation = cancelChatRecovery('chat-1')

    await expect(
      persistChatRecoveryEnvelope({
        userId: 'user-1',
        chatId: 'chat-1',
        turnId: 'turn-1',
        storage: STORAGE,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    await expect(cancellation).resolves.toBe(false)

    expect(encryptRecoveryEnvelope).not.toHaveBeenCalled()
    expect(addPendingRecovery).not.toHaveBeenCalled()
    expect(dropRun).toHaveBeenCalledWith(STORAGE)
  })

  it('discards an envelope registered after the turn was marked cancelled', async () => {
    // Stop pressed before the first token: cancelGeneration marks the turn
    // cancelled synchronously with the abort, while the in-flight request's
    // registration races it. The late registration must not write an envelope
    // (which would surface "Recovering stream..." for a stopped turn).
    startChatRecoveryAttempt('chat-1', 'turn-1', STORAGE)
    markChatRecoveryTurnCancelled('chat-1', 'turn-1')

    await expect(
      persistChatRecoveryEnvelope({
        userId: 'user-1',
        chatId: 'chat-1',
        turnId: 'turn-1',
        storage: STORAGE,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })

    expect(addPendingRecovery).not.toHaveBeenCalled()
    expect(dropRun).toHaveBeenCalledWith(STORAGE)
  })

  it('cancels only the stopped turn when a successor is already active', async () => {
    const successorEnvelope = { ...envelope, turnId: 'turn-2' }
    encryptRecoveryEnvelope
      .mockResolvedValueOnce(envelope)
      .mockResolvedValueOnce(successorEnvelope)
    startChatRecoveryAttempt('chat-1', 'turn-1', STORAGE)
    await persistChatRecoveryEnvelope({
      userId: 'user-1',
      chatId: 'chat-1',
      turnId: 'turn-1',
      storage: STORAGE,
    })
    startChatRecoveryAttempt('chat-1', 'turn-2', OTHER_STORAGE)
    await persistChatRecoveryEnvelope({
      userId: 'user-1',
      chatId: 'chat-1',
      turnId: 'turn-2',
      storage: OTHER_STORAGE,
    })

    await cancelChatRecovery('chat-1', undefined, 'turn-1')

    expect(dropRun).toHaveBeenCalledWith(STORAGE)
    expect(dropRun).not.toHaveBeenCalledWith(OTHER_STORAGE)
    expect(removePendingRecovery).toHaveBeenCalledWith(
      'chat-1',
      envelope,
      expect.any(Function),
    )
    expect(removePendingRecovery).not.toHaveBeenCalledWith(
      'chat-1',
      successorEnvelope,
      expect.any(Function),
    )
  })

  it('discards a cancelled-turn envelope even when the mark lands mid-persist', async () => {
    // Narrower window: the cancel mark arrives after the registration already
    // passed its entry checks and is awaiting envelope encryption.
    startChatRecoveryAttempt('chat-1', 'turn-1', STORAGE)
    encryptRecoveryEnvelope.mockImplementationOnce(async () => {
      markChatRecoveryTurnCancelled('chat-1', 'turn-1')
      return envelope
    })

    await expect(
      persistChatRecoveryEnvelope({
        userId: 'user-1',
        chatId: 'chat-1',
        turnId: 'turn-1',
        storage: STORAGE,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })

    expect(addPendingRecovery).not.toHaveBeenCalled()
    expect(dropRun).toHaveBeenCalledWith(STORAGE)
  })

  it('retains the stored run when interrupted output cannot be saved', async () => {
    await persistActiveRecovery()
    completePendingRecovery.mockRejectedValueOnce(new Error('save failed'))

    await expect(
      cancelChatRecovery('chat-1', {
        role: 'assistant',
        content: 'Partial answer',
        turnId: 'turn-1',
        timestamp: new Date(),
      }),
    ).rejects.toThrow('save failed')

    expect(dropRun).not.toHaveBeenCalled()
  })

  it('does not overwrite a concurrently removed recovery', async () => {
    await persistActiveRecovery()
    completePendingRecovery.mockResolvedValueOnce({
      id: 'chat-1',
      messages: [{ role: 'user', content: 'Question', turnId: 'turn-1' }],
    })

    const handled = await cancelChatRecovery('chat-1', {
      role: 'assistant',
      content: 'Partial answer',
      turnId: 'turn-1',
      timestamp: new Date(),
    })

    expect(handled).toBe(true)
    expect(dropRun).not.toHaveBeenCalled()
  })

  it('stores a local recovery pair without a cloud encryption key', async () => {
    cloudSyncEnabled = false
    getChat.mockResolvedValue({ id: 'chat-1', isLocalOnly: true })
    startChatRecoveryAttempt('chat-1', 'turn-1', STORAGE)

    await persistChatRecoveryEnvelope({
      userId: 'user-1',
      chatId: 'chat-1',
      turnId: 'turn-1',
      storage: STORAGE,
    })

    expect(encryptRecoveryEnvelope).not.toHaveBeenCalled()
    expect(addPendingRecovery).toHaveBeenCalledWith(
      'chat-1',
      expect.objectContaining({
        storage: 'local',
        turnId: 'turn-1',
        ...STORAGE,
      }),
    )
  })

  it('replays a run from its first frame and persists only once it ends', async () => {
    pendingChat()
    resumeRun.mockImplementation(async function* () {
      for (const event of frames(['Recover', 'ed'])) {
        if (event.type === 'RUN_FINISHED') {
          expect(completePendingRecovery).not.toHaveBeenCalled()
        }
        yield event
      }
    })

    await scanPendingChatRecoveries('user-1')

    expect(resumeRun).toHaveBeenCalledWith(STORAGE, expect.any(AbortSignal))
    expect(setChatRecoveryDraft).toHaveBeenCalledWith({
      chatId: 'chat-1',
      turnId: 'turn-1',
      storageId: STORAGE.storageId,
      message: expect.objectContaining({
        role: 'assistant',
        content: 'Recover',
        turnId: 'turn-1',
      }),
    })
    expect(completePendingRecovery).toHaveBeenCalledWith(
      'chat-1',
      expect.objectContaining({ turnId: 'turn-1' }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Recovered',
        turnId: 'turn-1',
      }),
      undefined,
      expect.any(Function),
      expect.any(AbortSignal),
    )
    expect(dropRun).toHaveBeenCalledWith(STORAGE)
  })

  it('generates a title when the first response is recovered', async () => {
    pendingChat()
    getChat.mockResolvedValue({
      id: 'chat-1',
      title: 'Untitled',
      titleState: 'placeholder',
      messages: [
        {
          role: 'user',
          turnId: 'turn-1',
          content: '',
          attachments: [
            {
              fileName: 'recovery.txt',
              textContent: '   ',
              description: 'How does encrypted recovery work?',
            },
          ],
        },
      ],
    })
    resumeRun.mockImplementation(replays(frames(['Recovered'])))
    generateTitle.mockResolvedValue('Encrypted recovery')

    await scanPendingChatRecoveries('user-1')

    expect(generateTitle).toHaveBeenCalledWith([
      { role: 'user', content: 'How does encrypted recovery work?' },
    ])
    expect(completePendingRecovery).toHaveBeenCalledWith(
      'chat-1',
      expect.objectContaining({ turnId: 'turn-1' }),
      expect.objectContaining({ content: 'Recovered' }),
      {
        title: 'Encrypted recovery',
        titleState: 'generated',
        expectedTitleState: 'placeholder',
      },
      expect.any(Function),
      expect.any(AbortSignal),
    )
  })

  it('releases recovery activity before dropping the completed run', async () => {
    pendingChat()
    resumeRun.mockImplementation(replays(frames(['Recovered'])))
    let finishDrop: (() => void) | undefined
    dropRun.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishDrop = resolve
        }),
    )

    const scan = scanPendingChatRecoveries('user-1')
    await vi.waitFor(() => {
      expect(completePendingRecovery).toHaveBeenCalled()
      expect(setChatRecoveryActive).toHaveBeenLastCalledWith(
        'chat-1',
        'turn-1',
        false,
      )
    })

    finishDrop?.()
    await scan
  })

  it('ignores a replayed frame that arrives after cancellation', async () => {
    pendingChat()
    let letGo: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      letGo = resolve
    })
    resumeRun.mockImplementation(async function* () {
      await gate
      yield* frames(['Stale replay'])
    })

    const scan = scanPendingChatRecoveries('user-1')
    await vi.waitFor(() => expect(letGo).toBeTypeOf('function'))
    await vi.waitFor(() => expect(resumeRun).toHaveBeenCalled())
    await cancelChatRecovery('chat-1')
    letGo?.()

    await scan
    expect(setChatRecoveryDraft).not.toHaveBeenCalled()
  })

  it('publishes the recovered replay from its first visible update', async () => {
    pendingChat()
    resumeRun.mockImplementation(replays(frames(['Recovered so far'])))

    await scanPendingChatRecoveries('user-1')

    expect(setChatRecoveryDraft).toHaveBeenCalledTimes(1)
    expect(setChatRecoveryDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'chat-1',
        turnId: 'turn-1',
        message: expect.objectContaining({ content: 'Recovered so far' }),
      }),
    )
  })

  it('releases recovery activity when checkpoint loading fails', async () => {
    pendingChat()
    getChat.mockRejectedValueOnce(new Error('IndexedDB unavailable'))

    await scanPendingChatRecoveries('user-1')

    expect(resumeRun).not.toHaveBeenCalled()
    expect(setChatRecoveryActive.mock.calls).toEqual([
      ['chat-1', 'turn-1', true],
      ['chat-1', 'turn-1', false],
    ])
  })

  it('keeps what a run that died managed to say', async () => {
    pendingChat()
    resumeRun.mockImplementation(replays(frames(['Partial'], 'RUN_ERROR')))

    await scanPendingChatRecoveries('user-1')

    expect(completePendingRecovery).toHaveBeenCalledWith(
      'chat-1',
      expect.objectContaining({ turnId: 'turn-1' }),
      expect.objectContaining({ content: 'Partial', turnId: 'turn-1' }),
      undefined,
      expect.any(Function),
      expect.any(AbortSignal),
    )
    expect(dropRun).toHaveBeenCalledWith(STORAGE)
  })

  it('drops the envelope for a run that said nothing before it died', async () => {
    pendingChat()
    resumeRun.mockImplementation(replays(frames([], 'RUN_ERROR')))

    await scanPendingChatRecoveries('user-1')

    expect(completePendingRecovery).not.toHaveBeenCalled()
    expect(removePendingRecovery).toHaveBeenCalledWith(
      'chat-1',
      expect.objectContaining({ turnId: 'turn-1' }),
      expect.any(Function),
      expect.any(AbortSignal),
    )
    expect(dropRun).toHaveBeenCalledWith(STORAGE)
  })

  it('drops the envelope when the harness will not open the log', async () => {
    // A run that finished with its caller attached was never written down, so
    // there is nothing to come back to and nothing to drop.
    pendingChat()
    resumeRun.mockImplementation(async function* () {
      throw new RunGoneError()
    })

    await scanPendingChatRecoveries('user-1')

    expect(completePendingRecovery).not.toHaveBeenCalled()
    expect(removePendingRecovery).toHaveBeenCalledWith(
      'chat-1',
      expect.objectContaining({ turnId: 'turn-1' }),
      expect.any(Function),
      expect.any(AbortSignal),
    )
    expect(dropRun).not.toHaveBeenCalled()
  })

  it('keeps the envelope when the replay itself fails', async () => {
    pendingChat()
    resumeRun.mockImplementation(async function* () {
      throw new TypeError('terminated')
    })

    await scanPendingChatRecoveries('user-1')

    expect(removePendingRecovery).not.toHaveBeenCalled()
    expect(dropRun).not.toHaveBeenCalled()
    expect(setChatRecoveryActive.mock.calls).toEqual([
      ['chat-1', 'turn-1', true],
      ['chat-1', 'turn-1', false],
    ])
  })

  it('does not mistake a replay that gave up for a run that ended', async () => {
    // Half an answer and no terminal frame is a replay this attempt could not
    // finish, not the run's last word: the envelope has to survive it.
    pendingChat()
    resumeRun.mockImplementation(async function* () {
      yield* frames(['Half an answer']).slice(0, 2)
      throw new ChatError('stopped arriving', 'FETCH_ERROR')
    })

    await scanPendingChatRecoveries('user-1')

    expect(completePendingRecovery).not.toHaveBeenCalled()
    expect(removePendingRecovery).not.toHaveBeenCalled()
    expect(dropRun).not.toHaveBeenCalled()
  })

  it('does not regress the visible draft while replaying from the first frame', async () => {
    pendingChat()
    getChatRecoveryDraft.mockReturnValue({
      chatId: 'chat-1',
      turnId: 'turn-1',
      storageId: STORAGE.storageId,
      message: {
        role: 'assistant',
        content: 'Already shown',
        timestamp: new Date().toISOString(),
      },
    })
    resumeRun.mockImplementation(
      replays(frames(['Already ', 'shown', ' and more'])),
    )

    await scanPendingChatRecoveries('user-1')

    expect(setChatRecoveryDraft).toHaveBeenCalledTimes(1)
    expect(setChatRecoveryDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({ content: 'Already shown and more' }),
      }),
    )
  })

  it('ignores a presentation checkpoint from a replaced run', async () => {
    pendingChat()
    getChatRecoveryDraft.mockReturnValue({
      chatId: 'chat-1',
      turnId: 'turn-1',
      storageId: OTHER_STORAGE.storageId,
      message: {
        role: 'assistant',
        content: 'Output from a replaced run',
        timestamp: new Date().toISOString(),
      },
    })
    resumeRun.mockImplementation(replays(frames(['New run output'])))

    await scanPendingChatRecoveries('user-1')

    expect(setChatRecoveryDraft).toHaveBeenCalledTimes(1)
    expect(setChatRecoveryDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        storageId: STORAGE.storageId,
        message: expect.objectContaining({ content: 'New run output' }),
      }),
    )
  })

  it('keeps a persisted partial visible until replay catches up', async () => {
    pendingChat()
    getChat.mockResolvedValue({
      id: 'chat-1',
      isLocalOnly: false,
      messages: [
        {
          role: 'assistant',
          turnId: 'turn-1',
          content: 'Already persisted',
          timestamp: new Date().toISOString(),
        },
      ],
    })
    resumeRun.mockImplementation(
      replays(frames(['Already persisted', ' and more'])),
    )

    await scanPendingChatRecoveries('user-1')

    expect(setChatRecoveryDraft).toHaveBeenCalledTimes(1)
    expect(setChatRecoveryDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          content: 'Already persisted and more',
        }),
      }),
    )
  })

  it('reuses an in-flight recovery scan instead of restarting its replay', async () => {
    pendingChat()
    resumeRun.mockImplementation(replaysThenHangs(frames([])))

    const firstScan = scanPendingChatRecoveries('user-1')
    await vi.waitFor(() => expect(resumeRun).toHaveBeenCalledTimes(1))
    const repeatedScan = scanPendingChatRecoveries('user-1')

    expect(repeatedScan).toBe(firstScan)
    expect(resumeRun).toHaveBeenCalledTimes(1)

    await cancelChatRecovery('chat-1')
    await firstScan
  })

  it('queues refreshed discovery without restarting the active replay', async () => {
    getPendingChatRecoveries
      .mockResolvedValueOnce([{ id: 'chat-1', pendingRecoveries: [envelope] }])
      .mockResolvedValueOnce([])
    decryptRecoveryEnvelope.mockResolvedValue(STORAGE)
    let finishReplay: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      finishReplay = resolve
    })
    resumeRun.mockImplementation(async function* () {
      await gate
      yield* frames(['Complete'])
    })

    const activeScan = scanPendingChatRecoveries('user-1')
    await vi.waitFor(() => expect(resumeRun).toHaveBeenCalledTimes(1))
    const refresh = scanPendingChatRecoveries('user-1', true)

    expect(refresh).toBe(activeScan)
    expect(resumeRun).toHaveBeenCalledTimes(1)

    finishReplay?.()
    await activeScan
    await vi.waitFor(() =>
      expect(getPendingChatRecoveries).toHaveBeenCalledTimes(2),
    )
  })

  it('saves the visible draft when cancelling a resumed recovery replay', async () => {
    pendingChat()
    let recoverySignal: AbortSignal | undefined
    resumeRun.mockImplementation(
      (_storage: RunStorage, signal: AbortSignal) => {
        recoverySignal = signal
        return replaysThenHangs(frames([]))(_storage, signal)
      },
    )
    getChatRecoveryDraft.mockReturnValue({
      chatId: 'chat-1',
      turnId: 'turn-1',
      storageId: STORAGE.storageId,
      message: {
        role: 'assistant',
        content: '',
        thoughts: 'Recovered reasoning so far',
        isThinking: true,
        timestamp: new Date(),
        timeline: [
          {
            type: 'thinking',
            id: 'thinking-0',
            content: 'Recovered reasoning so far',
            isThinking: true,
          },
        ],
      },
    })
    completePendingRecovery.mockResolvedValueOnce({
      id: 'chat-1',
      messages: [
        {
          role: 'assistant',
          content: '',
          thoughts: 'Recovered reasoning so far',
          isThinking: false,
          turnId: 'turn-1',
        },
      ],
    })

    const scan = scanPendingChatRecoveries('user-1')
    await vi.waitFor(() => {
      expect(setChatRecoveryActive).toHaveBeenCalledWith(
        'chat-1',
        'turn-1',
        true,
      )
    })

    const result = await cancelChatRecovery('chat-1')
    await scan

    expect(result).toBe(true)
    expect(recoverySignal?.aborted).toBe(true)
    expect(setChatRecoveryActive).toHaveBeenCalledWith(
      'chat-1',
      'turn-1',
      false,
    )
    expect(completePendingRecovery).toHaveBeenCalledWith(
      'chat-1',
      expect.objectContaining({ turnId: 'turn-1' }),
      expect.objectContaining({
        turnId: 'turn-1',
        thoughts: 'Recovered reasoning so far',
        isThinking: false,
        timeline: [
          expect.objectContaining({
            type: 'thinking',
            content: 'Recovered reasoning so far',
            isThinking: false,
          }),
        ],
      }),
      {},
      expect.any(Function),
    )
    expect(removePendingRecovery).not.toHaveBeenCalled()
    expect(dropRun).toHaveBeenCalledWith(STORAGE)
  })

  it('recovers a device-local pair directly from IndexedDB', async () => {
    getPendingChatRecoveries.mockResolvedValue([
      {
        id: 'chat-1',
        isLocalOnly: true,
        pendingRecoveries: [
          {
            v: 1,
            storage: 'local',
            turnId: 'turn-1',
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            ...STORAGE,
          },
        ],
      },
    ])
    resumeRun.mockImplementation(replays(frames(['Recovered locally'])))

    await scanPendingChatRecoveries('user-1')

    expect(decryptRecoveryEnvelope).not.toHaveBeenCalled()
    expect(resumeRun).toHaveBeenCalledWith(STORAGE, expect.any(AbortSignal))
    expect(completePendingRecovery).toHaveBeenCalled()
    expect(dropRun).toHaveBeenCalledWith(STORAGE)
  })

  it('stops an old account scan when recovery state is reset', async () => {
    let resolveChats: ((chats: unknown[]) => void) | undefined
    getPendingChatRecoveries.mockReturnValueOnce(
      new Promise<unknown[]>((resolve) => {
        resolveChats = resolve
      }),
    )
    const oldScan = scanPendingChatRecoveries('old-user')

    resetChatRecoveryState()
    resolveChats?.([{ id: 'chat-1', pendingRecoveries: [envelope] }])
    await oldScan

    expect(decryptRecoveryEnvelope).not.toHaveBeenCalled()
    getPendingChatRecoveries.mockResolvedValueOnce([])
    await expect(scanPendingChatRecoveries('new-user')).resolves.toBeUndefined()
  })

  it('aborts an aged scan before starting its replacement', async () => {
    let now = 1_000
    const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => now)
    pendingChat()
    resumeRun.mockImplementation(replays(frames(['Recovered'])))
    let firstSignal: AbortSignal | undefined
    completePendingRecovery.mockImplementationOnce((...args: unknown[]) => {
      firstSignal = args[5] as AbortSignal
      return new Promise<void>((_resolve, reject) => {
        firstSignal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        )
      })
    })

    const oldScan = scanPendingChatRecoveries('user-1')
    await vi.waitFor(() =>
      expect(completePendingRecovery).toHaveBeenCalledTimes(1),
    )

    now += RECOVERY_SCAN_MAX_AGE_MS
    const replacement = scanPendingChatRecoveries('user-1')

    await expect(replacement).resolves.toBeUndefined()
    await expect(oldScan).resolves.toBeUndefined()
    expect(firstSignal?.aborted).toBe(true)
    expect(completePendingRecovery).toHaveBeenCalledTimes(2)
    expect(completePendingRecovery.mock.calls[1][5]).toBeInstanceOf(AbortSignal)
    expect(completePendingRecovery.mock.calls[1][5].aborted).toBe(false)
    dateNow.mockRestore()
  })

  it('replaces a replay that reports no forward progress', async () => {
    let now = 1_000
    const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => now)
    pendingChat()
    resumeRun.mockImplementation(replaysThenHangs(frames([])))

    const oldScan = scanPendingChatRecoveries('user-1')
    await vi.waitFor(() => expect(resumeRun).toHaveBeenCalledTimes(1))

    now += RECOVERY_SCAN_MAX_AGE_MS
    const replacement = scanPendingChatRecoveries('user-1')

    expect(replacement).not.toBe(oldScan)
    await vi.waitFor(() => expect(resumeRun).toHaveBeenCalledTimes(2))
    expect((resumeRun.mock.calls[0][1] as AbortSignal).aborted).toBe(true)

    await cancelChatRecovery('chat-1')
    await replacement
    await oldScan
    dateNow.mockRestore()
  })

  it('retains stale recovery ownership when replacement discovery fails', async () => {
    let now = 1_000
    const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => now)
    getPendingChatRecoveries
      .mockResolvedValueOnce([{ id: 'chat-1', pendingRecoveries: [envelope] }])
      .mockRejectedValueOnce(new Error('IndexedDB unavailable'))
      .mockResolvedValueOnce([])
    decryptRecoveryEnvelope.mockResolvedValue(STORAGE)
    resumeRun.mockImplementation(replaysThenHangs(frames([])))

    const oldScan = scanPendingChatRecoveries('user-1')
    await vi.waitFor(() => expect(resumeRun).toHaveBeenCalledTimes(1))
    now += RECOVERY_SCAN_MAX_AGE_MS

    await expect(scanPendingChatRecoveries('user-1')).rejects.toThrow(
      'IndexedDB unavailable',
    )
    await oldScan
    expect(setChatRecoveryActive).not.toHaveBeenCalledWith(
      'chat-1',
      'turn-1',
      false,
    )

    await scanPendingChatRecoveries('user-1')
    expect(setChatRecoveryActive).toHaveBeenCalledWith(
      'chat-1',
      'turn-1',
      false,
    )
    dateNow.mockRestore()
  })

  it('does not invalidate a live attempt when a recovery scan starts', async () => {
    getPendingChatRecoveries.mockResolvedValue([])
    encryptRecoveryEnvelope.mockResolvedValue(envelope)
    startChatRecoveryAttempt('chat-1', 'turn-1', STORAGE)

    await scanPendingChatRecoveries('user-1')
    await persistChatRecoveryEnvelope({
      userId: 'user-1',
      chatId: 'chat-1',
      turnId: 'turn-1',
      storage: STORAGE,
    })

    expect(addPendingRecovery).toHaveBeenCalledWith('chat-1', envelope)
  })

  it('rejects envelope persistence after the account generation changes', async () => {
    let finishEncryption: ((value: PendingRecoveryEnvelope) => void) | undefined
    encryptRecoveryEnvelope.mockReturnValueOnce(
      new Promise<PendingRecoveryEnvelope>((resolve) => {
        finishEncryption = resolve
      }),
    )
    startChatRecoveryAttempt('chat-1', 'turn-1', STORAGE)
    const persistence = persistChatRecoveryEnvelope({
      userId: 'user-1',
      chatId: 'chat-1',
      turnId: 'turn-1',
      storage: STORAGE,
    })

    resetChatRecoveryState()
    finishEncryption?.(envelope)

    await expect(persistence).rejects.toMatchObject({ name: 'AbortError' })
    expect(addPendingRecovery).not.toHaveBeenCalled()
    expect(dropRun).toHaveBeenCalledWith(STORAGE)
  })

  it('lets an in-flight abandonment reject stale account cleanup', async () => {
    let rejectRemoval: ((error: Error) => void) | undefined
    removePendingRecovery.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        rejectRemoval = reject
      }),
    )
    await persistActiveRecovery()

    const abandonment = abandonChatRecoveryAttempt(STORAGE)
    await vi.waitFor(() =>
      expect(removePendingRecovery).toHaveBeenCalledWith(
        'chat-1',
        expect.objectContaining({ turnId: 'turn-1' }),
        expect.any(Function),
      ),
    )
    const isCurrent = removePendingRecovery.mock.calls[0][2]
    resetChatRecoveryState()
    expect(isCurrent()).toBe(false)
    rejectRemoval?.(new DOMException('Aborted', 'AbortError'))
    await expect(abandonment).rejects.toMatchObject({ name: 'AbortError' })

    expect(dropRun).toHaveBeenCalledWith(STORAGE)
  })

  it('lets an in-flight cancellation reject stale account cleanup', async () => {
    let rejectRemoval: ((error: Error) => void) | undefined
    removePendingRecovery.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        rejectRemoval = reject
      }),
    )
    await persistActiveRecovery()

    const cancellation = cancelChatRecovery('chat-1')
    await vi.waitFor(() =>
      expect(removePendingRecovery).toHaveBeenCalledWith(
        'chat-1',
        expect.objectContaining({ turnId: 'turn-1' }),
        expect.any(Function),
      ),
    )
    const isCurrent = removePendingRecovery.mock.calls[0][2]
    resetChatRecoveryState()
    expect(isCurrent()).toBe(false)
    rejectRemoval?.(new DOMException('Aborted', 'AbortError'))
    await expect(cancellation).rejects.toMatchObject({ name: 'AbortError' })

    expect(dropRun).toHaveBeenCalledWith(STORAGE)
  })

  it('rewraps an envelope opened with a historical CEK', async () => {
    storedAlternatives = ['historical-key']
    getPendingChatRecoveries.mockResolvedValue([
      { id: 'chat-1', pendingRecoveries: [envelope] },
    ])
    decryptRecoveryEnvelope
      .mockRejectedValueOnce(new Error('wrong key'))
      .mockResolvedValueOnce(STORAGE)
    const rewrapped = {
      ...envelope,
      keyId: 'abcdefabcdefabcdefabcdefabcdefab',
    }
    rewrapRecoveryEnvelope.mockResolvedValue(rewrapped)
    replacePendingRecovery.mockResolvedValue({
      pendingRecoveries: [rewrapped],
    })
    resumeRun.mockImplementation(async function* () {
      throw new RunGoneError()
    })

    await scanPendingChatRecoveries('user-1')

    expect(rewrapRecoveryEnvelope).toHaveBeenCalled()
    expect(replacePendingRecovery).toHaveBeenCalledWith(
      'chat-1',
      envelope,
      expect.objectContaining({
        keyId: 'abcdefabcdefabcdefabcdefabcdefab',
      }),
      expect.any(Function),
      expect.any(AbortSignal),
    )
  })
})
