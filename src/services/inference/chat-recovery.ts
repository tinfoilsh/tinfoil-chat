import {
  finalizeInterruptedMessage,
  hasVisibleAssistantMessage,
  RichStreamSession,
} from '@/components/chat/hooks/streaming'
import type { Chat, Message } from '@/components/chat/types'
import { getKnownModelDisplayName } from '@/config/models'
import { DEFAULT_CHAT_TITLE } from '@/constants/chat'
import { retryDeferredAlternativesFinalization } from '@/services/cloud/legacy-blob-migration'
import { encryptionService } from '@/services/encryption/encryption-service'
import { indexedDBStorage } from '@/services/storage/indexed-db'
import {
  isLocalRecoveryEnvelope,
  RECOVERY_ENVELOPE_EXPIRY_MS,
  RECOVERY_ENVELOPE_VERSION,
  samePendingRecoveryEnvelope,
  type PendingRecoveryEnvelope,
  type SyncedRecoveryEnvelope,
} from '@/types/chat-recovery'
import { isCloudSyncEnabled } from '@/utils/cloud-sync-settings'
import { logError } from '@/utils/error-handling'
import { dropRun, resumeRun, RunGoneError } from './agui/client'
import type { RunStorage } from './agui/protocol'
import {
  decryptRecoveryEnvelope,
  encryptRecoveryEnvelope,
  rewrapRecoveryEnvelope,
} from './chat-recovery-crypto'
import {
  clearActiveChatRecoveries,
  clearChatRecoveryDrafts,
  getChatRecoveryDraft,
  pruneChatRecoveryDrafts,
  setChatRecoveryActive,
  setChatRecoveryDraft,
} from './chat-recovery-drafts'
import {
  addPendingRecovery,
  completePendingRecovery,
  removePendingRecovery,
  replacePendingRecovery,
  resetChatRecoverySyncState,
  sameRecoveredResponse,
} from './chat-recovery-sync'
import { generateTitle, getTitleContent } from './title'

type ActiveRecovery = {
  chatId: string
  turnId: string
  storage: RunStorage
  generation: number
  envelope?: PendingRecoveryEnvelope
}

type ScannedRecovery = {
  chatId: string
  turnId: string
  storage: RunStorage
  generation: number
  envelope: PendingRecoveryEnvelope
  controller: AbortController
}

const activeRecoveries = new Map<string, ActiveRecovery>()
const scannedRecoveries = new Map<string, ScannedRecovery>()
const cancelledTurns = new Set<string>()
const settledTurns = new Set<string>()
const MAX_SETTLED_TURNS = 200
const RECOVERY_SCAN_CONCURRENCY = 4
// Upper bound on how long a scan may make no progress while holding the
// dedupe slot. A stream wedged on a dead socket (e.g. after laptop sleep)
// would otherwise absorb every future scan and silently disable recovery
// for the rest of the session.
const RECOVERY_SCAN_MAX_AGE_MS = 120_000
let recoveryGeneration = 0
let recoveryScanGeneration = 0
let queuedScanUserId: string | null = null
let scanInFlight: {
  userId: string
  promise: Promise<void>
  lastProgressAt: number
  controller: AbortController
} | null = null

function turnKey(chatId: string, turnId: string): string {
  return `${chatId}\u0000${turnId}`
}

function hasVisibleRecoveryDraft(message: Message): boolean {
  return Boolean(
    message.content ||
    message.thoughts ||
    message.isThinking ||
    message.timeline?.length ||
    message.urlFetches?.length ||
    message.webSearch ||
    message.toolCalls?.length ||
    message.codeExecCalls?.length,
  )
}

async function recoveredTitlePatch(
  chatId: string,
  turnId: string,
  isCurrent: () => boolean,
): Promise<
  | {
      title: string
      titleState: 'generated'
      expectedTitleState: 'placeholder'
    }
  | undefined
> {
  const chat = await indexedDBStorage.getChat(chatId)
  if (!isCurrent() || chat?.titleState !== 'placeholder') return

  const firstUserMessage = chat.messages.find(
    (message) => message.role === 'user',
  )
  if (!firstUserMessage || firstUserMessage.turnId !== turnId) return

  const content = getTitleContent(firstUserMessage)
  const title = await generateTitle([{ role: 'user', content }])
  if (!isCurrent() || title === DEFAULT_CHAT_TITLE) return
  return {
    title,
    titleState: 'generated',
    expectedTitleState: 'placeholder',
  }
}

function candidateCEKs(): Uint8Array[] {
  const candidates: Uint8Array[] = [encryptionService.getKeyBytesOrThrow()]
  for (const alternative of encryptionService.getStoredAlternatives()) {
    const bytes = encryptionService.getAlternativeKeyBytes(alternative)
    if (bytes) candidates.push(bytes)
  }
  return candidates
}

async function openEnvelope(
  userId: string,
  chatId: string,
  envelope: PendingRecoveryEnvelope,
  now?: number,
) {
  if (isLocalRecoveryEnvelope(envelope)) {
    return {
      cek: null,
      payload: {
        sessionId: envelope.sessionId,
        recoveryToken: envelope.recoveryToken,
      },
      usesPrimary: true,
    }
  }
  let lastError: unknown
  const candidates = candidateCEKs()
  for (let index = 0; index < candidates.length; index++) {
    const cek = candidates[index]
    try {
      const payload = await decryptRecoveryEnvelope({
        cek,
        userId,
        chatId,
        envelope,
        now,
      })
      return { cek, payload, usesPrimary: index === 0 }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error('Unable to decrypt chat recovery envelope')
}

function isSyncedRecoveryEnvelope(
  envelope: PendingRecoveryEnvelope,
): envelope is SyncedRecoveryEnvelope {
  return !isLocalRecoveryEnvelope(envelope)
}

async function dropRunQuietly(storage: RunStorage): Promise<void> {
  try {
    await dropRun(storage)
  } catch (error) {
    logError('Failed to drop the stored run log', error, {
      component: 'chat-recovery',
      action: 'dropRun',
    })
  }
}

export function startChatRecoveryAttempt(
  chatId: string,
  turnId: string,
  storage: RunStorage,
): void {
  activeRecoveries.set(storage.sessionId, {
    chatId,
    turnId,
    storage,
    generation: recoveryGeneration,
  })
}

export async function persistChatRecoveryEnvelope(args: {
  userId: string
  chatId: string
  turnId: string
  storage: RunStorage
}): Promise<void> {
  const key = turnKey(args.chatId, args.turnId)
  const active = activeRecoveries.get(args.storage.sessionId)
  const isCurrentAttempt = () =>
    active?.generation === recoveryGeneration &&
    active.chatId === args.chatId &&
    active.turnId === args.turnId &&
    activeRecoveries.get(args.storage.sessionId) === active
  if (!active || !isCurrentAttempt() || cancelledTurns.has(key)) {
    await dropRunQuietly(args.storage)
    throw new DOMException('Aborted', 'AbortError')
  }

  const chat = await indexedDBStorage.getChat(args.chatId)
  if (!chat) {
    await dropRunQuietly(args.storage)
    throw new Error('Chat recovery could not find the target chat')
  }
  const localOnly = chat.isLocalOnly || !isCloudSyncEnabled()
  const now = new Date()
  const envelope: PendingRecoveryEnvelope = localOnly
    ? {
        v: RECOVERY_ENVELOPE_VERSION,
        storage: 'local',
        turnId: args.turnId,
        createdAt: now.toISOString(),
        expiresAt: new Date(
          now.getTime() + RECOVERY_ENVELOPE_EXPIRY_MS,
        ).toISOString(),
        ...args.storage,
      }
    : await encryptRecoveryEnvelope({
        cek: encryptionService.getKeyBytesOrThrow(),
        userId: args.userId,
        chatId: args.chatId,
        turnId: args.turnId,
        storage: args.storage,
      })
  // Re-check the cancelled set as well: a stop pressed while this token
  // capture was in flight marks the turn cancelled before the (later)
  // cancelChatRecovery call deregisters the attempt, so isCurrentAttempt
  // alone would still pass here and write an envelope for a stopped turn.
  if (!isCurrentAttempt() || cancelledTurns.has(key)) {
    await dropRunQuietly(args.storage)
    throw new DOMException('Aborted', 'AbortError')
  }
  await addPendingRecovery(args.chatId, envelope)

  if (!isCurrentAttempt()) {
    try {
      await removePendingRecovery(args.chatId, envelope)
    } finally {
      await dropRunQuietly(args.storage)
    }
    throw new DOMException('Aborted', 'AbortError')
  }
  active.envelope = envelope
  if (cancelledTurns.has(key)) {
    await Promise.all([
      removePendingRecovery(args.chatId, envelope, isCurrentAttempt),
      dropRunQuietly(args.storage),
    ])
    throw new DOMException('Aborted', 'AbortError')
  }
}

export async function abandonChatRecoveryAttempt(
  storage: RunStorage,
  spilled = true,
): Promise<void> {
  const active = activeRecoveries.get(storage.sessionId)
  activeRecoveries.delete(storage.sessionId)
  try {
    if (active) {
      const isCurrent = () => active.generation === recoveryGeneration
      if (isCurrent() && active.envelope) {
        await removePendingRecovery(active.chatId, active.envelope, isCurrent)
      }
    }
  } finally {
    if (spilled) await dropRunQuietly(storage)
  }
}

export async function completeLiveChatRecovery(args: {
  chatId: string
  turnId: string
  assistantMessage: Message
  chatPatch?: Parameters<typeof completePendingRecovery>[3]
}): Promise<Chat> {
  const active = [...activeRecoveries.values()].find(
    (candidate) =>
      candidate.chatId === args.chatId && candidate.turnId === args.turnId,
  )
  const isCurrent = () =>
    active?.generation === recoveryGeneration &&
    activeRecoveries.get(active.storage.sessionId) === active
  if (!active?.envelope || !isCurrent()) {
    throw new DOMException('Aborted', 'AbortError')
  }
  const completedChat = await completePendingRecovery(
    args.chatId,
    active.envelope,
    args.assistantMessage,
    args.chatPatch,
    isCurrent,
  )
  activeRecoveries.delete(active.storage.sessionId)
  return {
    ...completedChat,
    createdAt: new Date(completedChat.createdAt),
    pendingSave: false,
    messages: completedChat.messages.map((message) => ({
      ...message,
      timestamp: message.timestamp ? new Date(message.timestamp) : new Date(),
    })),
  }
}

export async function cancelChatRecovery(
  chatId: string,
  assistantMessage?: Message,
  turnId?: string,
): Promise<boolean> {
  const targetTurnId = assistantMessage?.turnId ?? turnId
  const active = [...activeRecoveries.values()].filter(
    (candidate) =>
      candidate.chatId === chatId &&
      (targetTurnId === undefined || candidate.turnId === targetTurnId),
  )
  const scanned = [...scannedRecoveries.values()].filter(
    (candidate) =>
      candidate.chatId === chatId &&
      (targetTurnId === undefined || candidate.turnId === targetTurnId),
  )
  for (const recovery of active) {
    cancelledTurns.add(turnKey(recovery.chatId, recovery.turnId))
    activeRecoveries.delete(recovery.storage.sessionId)
  }
  for (const recovery of scanned) {
    cancelledTurns.add(turnKey(recovery.chatId, recovery.turnId))
    scannedRecoveries.delete(recovery.storage.sessionId)
    recovery.controller.abort()
    setChatRecoveryActive(recovery.chatId, recovery.turnId, false)
  }
  const recoveries = [...active, ...scanned]
  const envelopeTurns = new Set(
    recoveries
      .filter((recovery) => recovery.envelope !== undefined)
      .map((recovery) => recovery.turnId),
  )
  await Promise.all(
    recoveries.map(async (recovery) => {
      const isCurrent = () => recovery.generation === recoveryGeneration
      if (!isCurrent()) return
      if (!recovery.envelope) {
        await dropRunQuietly(recovery.storage)
        return
      }

      const recoveryDraft = getChatRecoveryDraft(
        recovery.chatId,
        recovery.turnId,
      )
      const draftMessage =
        recoveryDraft?.sessionId === recovery.storage.sessionId
          ? recoveryDraft.message
          : undefined
      const stoppedMessage =
        assistantMessage?.turnId === recovery.turnId
          ? assistantMessage
          : draftMessage

      if (stoppedMessage && hasVisibleAssistantMessage(stoppedMessage)) {
        const finalizedMessage = finalizeInterruptedMessage(
          stoppedMessage,
          recovery.turnId,
        )
        const completedChat = await completePendingRecovery(
          recovery.chatId,
          recovery.envelope,
          finalizedMessage,
          {},
          isCurrent,
        )
        const persisted = completedChat.messages.some(
          (message) =>
            message.role === 'assistant' &&
            message.turnId === recovery.turnId &&
            hasVisibleAssistantMessage(message),
        )
        if (persisted) await dropRunQuietly(recovery.storage)
      } else {
        try {
          await removePendingRecovery(
            recovery.chatId,
            recovery.envelope,
            isCurrent,
          )
        } finally {
          await dropRunQuietly(recovery.storage)
        }
      }
    }),
  )
  return assistantMessage?.turnId
    ? envelopeTurns.has(assistantMessage.turnId)
    : envelopeTurns.size > 0
}

/**
 * Mark a turn's recovery as cancelled before the async cancellation work
 * runs. Stopping a generation before the first token races the recovery
 * registration (the token is captured when response headers arrive):
 * without this early mark, an in-flight persistChatRecoveryToken would
 * still write its envelope, briefly surfacing the stopped turn as a
 * recoverable stream until the envelope removal round-trips.
 */
export function markChatRecoveryTurnCancelled(
  chatId: string,
  turnId: string,
): void {
  cancelledTurns.add(turnKey(chatId, turnId))
}

export function isChatRecoveryTurnCancelled(
  chatId: string,
  turnId: string,
): boolean {
  const key = turnKey(chatId, turnId)
  return cancelledTurns.has(key) || settledTurns.has(key)
}

/**
 * Mark a turn whose live stream completed on screen. The UI settles to
 * idle before the envelope removal round-trips, so a storage reload in
 * that window must not re-adopt the turn's envelope and flash a recovery
 * indicator under an already-complete response. Kept separate from the
 * cancelled-turn registry: a settled turn's in-flight token persistence
 * and finalization must keep running, only envelope adoption stops.
 *
 * The guard is only needed until the turn's envelope removal settles, so
 * the registry is bounded by evicting the oldest marks; every turn ever
 * completed in a long-lived tab need not be retained.
 */
export function markChatRecoveryTurnSettled(
  chatId: string,
  turnId: string,
): void {
  settledTurns.add(turnKey(chatId, turnId))
  for (const oldest of settledTurns) {
    if (settledTurns.size <= MAX_SETTLED_TURNS) break
    settledTurns.delete(oldest)
  }
}

export function releaseActiveChatRecovery(
  chatId: string,
  turnId: string,
): void {
  // Scoped to a single turn: the chat stays interactive while a stream's
  // finalization settles, so a chat-wide release could destroy a successor
  // stream's just-registered recovery attempt.
  for (const recovery of activeRecoveries.values()) {
    if (recovery.chatId === chatId && recovery.turnId === turnId) {
      activeRecoveries.delete(recovery.storage.sessionId)
    }
  }
}

async function processEnvelope(
  userId: string,
  chatId: string,
  envelope: PendingRecoveryEnvelope,
  generation: number,
  signal: AbortSignal,
): Promise<void> {
  const key = turnKey(chatId, envelope.turnId)
  const isCurrent = () =>
    generation === recoveryScanGeneration &&
    !signal.aborted &&
    !cancelledTurns.has(key) &&
    !settledTurns.has(key)
  if (!isCurrent()) return
  if (
    [...activeRecoveries.values()].some(
      (active) => active.chatId === chatId && active.turnId === envelope.turnId,
    )
  ) {
    return
  }

  // Sealed by a client that minted a different pair. What it names cannot be
  // resumed here, so it goes now rather than failing to open on every scan
  // until it expires. The version is read off persisted JSON, which the type
  // describes but does not enforce.
  if ((envelope.v as number) !== RECOVERY_ENVELOPE_VERSION) {
    await removePendingRecovery(chatId, envelope, isCurrent, signal)
    return
  }

  if (Date.now() >= Date.parse(envelope.expiresAt)) {
    let storage: RunStorage | undefined
    try {
      const opened = await openEnvelope(
        userId,
        chatId,
        envelope,
        Date.parse(envelope.expiresAt) - 1,
      )
      if (!isCurrent()) return
      storage = opened.payload
    } catch (error) {
      logError('Failed to clean up expired chat recovery session', error, {
        component: 'chat-recovery',
        action: 'cleanupExpiredRecovery',
        metadata: { chatId },
      })
    }
    if (!isCurrent()) return
    try {
      await removePendingRecovery(chatId, envelope, isCurrent, signal)
    } finally {
      if (storage) {
        await dropRunQuietly(storage)
      }
    }
    return
  }

  const opened = await openEnvelope(userId, chatId, envelope)
  if (!isCurrent()) return
  if (!opened.usesPrimary && isSyncedRecoveryEnvelope(envelope)) {
    const rewrapped = await rewrapRecoveryEnvelope({
      envelope,
      userId,
      chatId,
      oldCek: opened.cek as Uint8Array,
      newCek: encryptionService.getKeyBytesOrThrow(),
    })
    if (!isCurrent()) return
    const rewrappedChat = await replacePendingRecovery(
      chatId,
      envelope,
      rewrapped,
      isCurrent,
      signal,
    )
    if (!isCurrent()) return
    if (
      !rewrappedChat.pendingRecoveries?.some((candidate) =>
        samePendingRecoveryEnvelope(candidate, rewrapped),
      )
    ) {
      return
    }
    envelope = rewrapped
  }
  const storage = opened.payload
  const replacedRunDrops: Promise<void>[] = []
  for (const [sessionId, retained] of scannedRecoveries) {
    if (retained.chatId !== chatId || retained.turnId !== envelope.turnId) {
      continue
    }
    if (
      sessionId === storage.sessionId &&
      !retained.controller.signal.aborted
    ) {
      return
    }
    scannedRecoveries.delete(sessionId)
    retained.controller.abort()
    setChatRecoveryActive(retained.chatId, retained.turnId, false)
    if (sessionId !== storage.sessionId) {
      replacedRunDrops.push(dropRunQuietly(retained.storage))
    }
  }

  const recoveryController = new AbortController()
  const abortRecovery = () => recoveryController.abort(signal.reason)
  const scannedRecovery: ScannedRecovery = {
    chatId,
    turnId: envelope.turnId,
    storage,
    generation: recoveryGeneration,
    envelope,
    controller: recoveryController,
  }
  signal.addEventListener('abort', abortRecovery, { once: true })
  scannedRecoveries.set(storage.sessionId, scannedRecovery)
  setChatRecoveryActive(chatId, envelope.turnId, true)
  const recoverySignal = recoveryController.signal
  const isRecoveryCurrent = () =>
    isCurrent() &&
    !recoverySignal.aborted &&
    scannedRecoveries.get(storage.sessionId) === scannedRecovery
  const markRecoveryProgress = () => {
    if (scanInFlight?.controller.signal === signal) {
      scanInFlight.lastProgressAt = Date.now()
    }
  }
  const publishDraft = (message: Message): void => {
    if (!isRecoveryCurrent() || !hasVisibleRecoveryDraft(message)) return
    setChatRecoveryDraft({
      chatId,
      turnId: envelope.turnId,
      sessionId: storage.sessionId,
      message: { ...message, role: 'assistant', turnId: envelope.turnId },
    })
  }
  try {
    const storedChat = await indexedDBStorage.getChat(chatId)
    if (!isRecoveryCurrent()) return
    const recoveryDraft = getChatRecoveryDraft(chatId, envelope.turnId)
    // What is already on screen for this turn. The replay starts at the run's
    // first frame, so publishing from the beginning would visibly rewind the
    // answer; nothing is published until the replay has caught up with it.
    const checkpoint =
      recoveryDraft?.sessionId === storage.sessionId
        ? recoveryDraft.message
        : (storedChat?.messages ?? []).find(
            (message) =>
              message.role === 'assistant' &&
              message.turnId === envelope.turnId,
          )
    let checkpointReached = !checkpoint
    // How far into the run a snapshot is. Everything counted here only grows
    // as a run advances, so a replay that measures past the checkpoint has
    // plainly passed it -- the fallback for a checkpoint the replay never
    // reproduces exactly (a wall-clock thinking duration, tool arguments
    // formatted as they arrived), which would otherwise freeze the answer on
    // screen for the rest of the replay.
    const progress = (message: Message): number =>
      message.content.length +
      (message.thoughts?.length ?? 0) +
      (message.timeline?.length ?? 0) +
      (message.urlFetches?.length ?? 0) +
      (message.codeExecCalls?.length ?? 0)
    const checkpointProgress = checkpoint ? progress(checkpoint) : 0
    const session = new RichStreamSession({
      modelDisplayName: storedChat?.model
        ? getKnownModelDisplayName(storedChat.model)
        : undefined,
      resolveModelDisplayName: getKnownModelDisplayName,
    })
    let assistantMessage: Message
    // A run that ended in RUN_ERROR -- it failed, or it did not survive the
    // harness that started it -- still said what it said, which is this
    // turn's answer. Anything else that goes wrong here is this attempt's
    // failure, not the run's.
    let runFailed = false
    try {
      // One stream, however many connections it takes: a replay that breaks
      // comes back at the frame it stopped on, so the run is rebuilt once.
      for await (const event of resumeRun(storage, recoverySignal)) {
        if (!isRecoveryCurrent()) return
        // A replay still catching up to the checkpoint publishes nothing, but
        // it is plainly getting somewhere: every frame counts as progress, or
        // the scan's staleness watchdog aborts a recovery that is working.
        markRecoveryProgress()
        runFailed ||= event.type === 'RUN_ERROR'
        if (!session.processEvent(event)) continue
        const snapshot = session.snapshot()
        if (!checkpointReached) {
          checkpointReached =
            sameRecoveredResponse(checkpoint as Message, snapshot) ||
            progress(snapshot) > checkpointProgress
          continue
        }
        publishDraft(snapshot)
      }
      assistantMessage = session.complete(envelope.turnId)
    } catch (error) {
      if (error instanceof RunGoneError) {
        // Nothing to come back to: the run ended with its caller attached and
        // was never written down, or its log is already gone.
        await removePendingRecovery(
          chatId,
          envelope,
          isRecoveryCurrent,
          recoverySignal,
        )
        return
      }
      if (!isRecoveryCurrent()) return
      // A replay that could not be finished is retried by the next scan,
      // envelope intact.
      if (!runFailed) throw error
      assistantMessage = session.interruptedSnapshot(envelope.turnId)
    } finally {
      session.close()
    }
    // A run with nothing to show would persist as an empty assistant message.
    if (!hasVisibleAssistantMessage(assistantMessage)) {
      try {
        await removePendingRecovery(
          chatId,
          envelope,
          isRecoveryCurrent,
          recoverySignal,
        )
      } finally {
        await dropRunQuietly(storage)
      }
      return
    }
    if (!isRecoveryCurrent()) return
    const titlePatch = await recoveredTitlePatch(
      chatId,
      envelope.turnId,
      isRecoveryCurrent,
    )
    if (!isRecoveryCurrent()) return
    await completePendingRecovery(
      chatId,
      envelope,
      { ...assistantMessage, turnId: envelope.turnId },
      titlePatch,
      isRecoveryCurrent,
      recoverySignal,
    )
    if (scannedRecoveries.get(storage.sessionId) === scannedRecovery) {
      scannedRecoveries.delete(storage.sessionId)
      setChatRecoveryActive(chatId, envelope.turnId, false)
    }
    await dropRunQuietly(storage)
  } finally {
    signal.removeEventListener('abort', abortRecovery)
    if (
      scannedRecoveries.get(storage.sessionId) === scannedRecovery &&
      isCurrent()
    ) {
      scannedRecoveries.delete(storage.sessionId)
      setChatRecoveryActive(chatId, envelope.turnId, false)
    }
    await Promise.all(replacedRunDrops)
  }
}

export function scanPendingChatRecoveries(
  userId: string,
  refreshPending = false,
): Promise<void> {
  if (
    scanInFlight?.userId === userId &&
    Date.now() - scanInFlight.lastProgressAt < RECOVERY_SCAN_MAX_AGE_MS
  ) {
    if (refreshPending) {
      queuedScanUserId = userId
    }
    return scanInFlight.promise
  }
  queuedScanUserId = null
  const generation = ++recoveryScanGeneration
  scanInFlight?.controller.abort()
  const controller = new AbortController()
  const promise = (async () => {
    try {
      const chats = await indexedDBStorage.getPendingChatRecoveries()
      if (generation !== recoveryScanGeneration) return
      const pending = chats.flatMap((chat) =>
        chat.pendingRecoveries.map((envelope) => ({
          chatId: chat.id,
          envelope,
        })),
      )
      const pendingTurnKeys = new Set(
        pending.map((candidate) =>
          turnKey(candidate.chatId, candidate.envelope.turnId),
        ),
      )
      const orphanedRunDrops: Promise<void>[] = []
      for (const [sessionId, retained] of scannedRecoveries) {
        if (pendingTurnKeys.has(turnKey(retained.chatId, retained.turnId))) {
          continue
        }
        scannedRecoveries.delete(sessionId)
        retained.controller.abort()
        setChatRecoveryActive(retained.chatId, retained.turnId, false)
        orphanedRunDrops.push(dropRunQuietly(retained.storage))
      }
      pruneChatRecoveryDrafts(pendingTurnKeys)
      let nextIndex = 0
      const worker = async () => {
        while (
          generation === recoveryScanGeneration &&
          nextIndex < pending.length
        ) {
          const candidate = pending[nextIndex++]
          try {
            await processEnvelope(
              userId,
              candidate.chatId,
              candidate.envelope,
              generation,
              controller.signal,
            )
          } catch (error) {
            if (generation !== recoveryScanGeneration) return
            if (
              cancelledTurns.has(
                turnKey(candidate.chatId, candidate.envelope.turnId),
              ) ||
              (error instanceof DOMException && error.name === 'AbortError')
            ) {
              continue
            }
            logError('Failed to recover encrypted chat response', error, {
              component: 'chat-recovery',
              action: 'scan',
              metadata: { chatId: candidate.chatId },
            })
          }
        }
      }
      await Promise.all([
        ...Array.from(
          { length: Math.min(RECOVERY_SCAN_CONCURRENCY, pending.length) },
          worker,
        ),
        ...orphanedRunDrops,
      ])
    } finally {
      if (generation === recoveryScanGeneration) {
        await retryDeferredAlternativesFinalization()
      }
    }
  })()
  scanInFlight = {
    userId,
    promise,
    lastProgressAt: Date.now(),
    controller,
  }
  const clear = () => {
    if (scanInFlight?.promise === promise) {
      scanInFlight = null
      if (queuedScanUserId === userId) {
        queuedScanUserId = null
        void scanPendingChatRecoveries(userId, true)
      }
    }
  }
  void promise.then(clear, clear)
  return promise
}

export function resetChatRecoveryState(): void {
  recoveryGeneration += 1
  recoveryScanGeneration += 1
  scanInFlight?.controller.abort()
  for (const recovery of scannedRecoveries.values()) {
    recovery.controller.abort()
  }
  activeRecoveries.clear()
  scannedRecoveries.clear()
  cancelledTurns.clear()
  settledTurns.clear()
  clearChatRecoveryDrafts()
  clearActiveChatRecoveries()
  scanInFlight = null
  queuedScanUserId = null
  resetChatRecoverySyncState()
}
