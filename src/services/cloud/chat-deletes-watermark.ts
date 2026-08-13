/**
 * Chat Deletes Watermark
 *
 * Durable cursor for the remote-deletion reconciliation pass, persisted in
 * localStorage. It records the server timestamp up to which chat tombstones
 * have been fetched AND applied locally.
 *
 * Deliberately independent from the sync-status cache: that cache is a
 * disposable freshness snapshot (cleared on account change, eviction sweeps,
 * cache misses) that advances whenever any sync pass completes. Reusing its
 * `lastUpdated` as the deletion cursor meant a single skipped or failed
 * deletion pass permanently hid the missed tombstones, leaving deleted chats
 * resurrectable on this device.
 */

import {
  SYNC_CHAT_DELETES_WATERMARK,
  SYNC_CHAT_DELETION_REVISION,
} from '@/constants/storage-keys'

/**
 * Seed for devices with no persisted watermark. The first pass replays every
 * retained tombstone, which is idempotent: already-deleted chats are absent
 * locally and only refresh the in-memory tracker.
 */
export const CHAT_DELETES_WATERMARK_EPOCH = '1970-01-01T00:00:00.000Z'

/**
 * Safety overlap subtracted from the newest observed server timestamp before
 * persisting. Tombstones written concurrently with a pass (same-millisecond
 * ties, replication lag) are re-listed by the next pass instead of being
 * skipped; re-applying a tombstone is a no-op.
 */
export const CHAT_DELETES_WATERMARK_OVERLAP_MS = 5_000

export function loadChatDeletesWatermark(): string {
  if (typeof window === 'undefined') return CHAT_DELETES_WATERMARK_EPOCH
  try {
    const raw = localStorage.getItem(SYNC_CHAT_DELETES_WATERMARK)
    if (raw && !Number.isNaN(Date.parse(raw))) {
      return raw
    }
  } catch {
    // Unreadable storage degrades to a full tombstone replay, never to
    // skipped deletions.
  }
  return CHAT_DELETES_WATERMARK_EPOCH
}

/**
 * Persist a new watermark derived from the newest event timestamp observed
 * in a fully reconciled pass. Monotonic: a stale candidate (overlap window,
 * concurrent passes) never regresses the stored value.
 */
export function advanceChatDeletesWatermark(latestEventAtMs: number): void {
  if (typeof window === 'undefined') return
  if (!Number.isFinite(latestEventAtMs)) return
  const candidateMs = latestEventAtMs - CHAT_DELETES_WATERMARK_OVERLAP_MS
  if (candidateMs <= Date.parse(loadChatDeletesWatermark())) return
  try {
    localStorage.setItem(
      SYNC_CHAT_DELETES_WATERMARK,
      new Date(candidateMs).toISOString(),
    )
  } catch {
    // Persisting is best-effort; the next pass re-reads the old value and
    // replays a wider window.
  }
}

export function clearChatDeletesWatermark(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(SYNC_CHAT_DELETES_WATERMARK)
  } catch {
    // best-effort
  }
}

export function publishChatDeletionRevision(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SYNC_CHAT_DELETION_REVISION, crypto.randomUUID())
  } catch {
    // best-effort
  }
}
