/**
 * useExecSnapshot — chat-scoped hook that prepares the X-Exec-Pubkey /
 * X-Exec-Resume-Dek headers for code-execution requests. The chat ID itself
 * is sent as X-Session-Id by the inference client.
 *
 * Lifecycle, per chat:
 *   1. When the active chat changes, derive the X25519 keypair from the
 *      cached PRF master and try to fetch + unwrap the existing snapshot
 *      DEK keyed by chat ID.
 *   2. The plaintext DEK lives only in this hook's React state (memory only,
 *      never persisted, never sent over the wire as plaintext except as
 *      X-Exec-Resume-Dek on the very next request).
 *   3. On the first code-exec request, the caller calls `consumeResumeDek()`
 *      to clear the DEK. The orchestrator generates a fresh DEK at next
 *      eviction.
 *   4. On unmount / chat switch, all sensitive state is dropped.
 *
 * If the snapshot exists but cannot be unwrapped (corrupt, key changed, etc.)
 * we mirror the existing `decryptionFailed` chat-path behavior — surface a
 * boolean so the UI can warn the user — and don't pretend everything is fine.
 */
import { deriveExecKeypair } from '@/services/exec-snapshot/key-derivation'
import {
  SnapshotDecryptionFailedError,
  fetchAndUnwrapDEK,
} from '@/services/exec-snapshot/snapshot-client'
import { getCachedPrfResult } from '@/services/passkey/passkey-service'
import { uint8ArrayToBase64Url } from '@/utils/binary-codec'
import { logError, logInfo } from '@/utils/error-handling'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface ExecSnapshotState {
  /** User pubkey (base64url, no padding). Sent as X-Exec-Pubkey. */
  execPubkey: string | null
  /**
   * Plaintext DEK (base64url, no padding) that should ride along on the next
   * code-exec request as X-Exec-Resume-Dek. null after consumption.
   */
  execResumeDek: string | null
  /**
   * True when a snapshot existed for this chat but could not be decrypted.
   * Mirrors the chat-path `decryptionFailed` flag.
   */
  decryptionFailed: boolean
  /** True while the chat-open snapshot fetch is in flight. */
  isLoading: boolean
  /**
   * Mark the resume DEK as consumed (the orchestrator will issue a fresh DEK
   * at the next snapshot eviction). Idempotent.
   */
  consumeResumeDek: () => void
  /**
   * Acknowledge the decryption-failure flag (after surfacing to the user).
   * Mirrors `clearInitialChatDecryptionFailed` from the chat-load path.
   */
  clearDecryptionFailed: () => void
}

export function useExecSnapshot(opts: {
  chatId: string | undefined | null
  isSignedIn: boolean | undefined
}): ExecSnapshotState {
  const { chatId, isSignedIn } = opts

  const [execPubkey, setExecPubkey] = useState<string | null>(null)
  const [execResumeDek, setExecResumeDek] = useState<string | null>(null)
  const [decryptionFailed, setDecryptionFailed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Tracks the chat this state corresponds to, so a stale async result from
  // a previous chat doesn't leak into the new one.
  const activeChatRef = useRef<string | null>(null)

  const consumeResumeDek = useCallback(() => {
    setExecResumeDek(null)
  }, [])

  const clearDecryptionFailed = useCallback(() => {
    setDecryptionFailed(false)
  }, [])

  useEffect(() => {
    if (!chatId || !isSignedIn) {
      activeChatRef.current = null
      setExecPubkey(null)
      setExecResumeDek(null)
      setDecryptionFailed(false)
      setIsLoading(false)
      return
    }

    activeChatRef.current = chatId
    let cancelled = false

    const run = async () => {
      setIsLoading(true)
      setDecryptionFailed(false)
      setExecResumeDek(null)
      setExecPubkey(null)

      const cached = getCachedPrfResult()
      if (!cached) {
        // No PRF available (user hasn't unlocked passkey yet, or signed-out
        // user). Nothing we can do — leave headers empty; the user will not
        // be able to use code execution until passkey unlock anyway, and the
        // toggle is gated separately.
        if (!cancelled && activeChatRef.current === chatId) {
          setIsLoading(false)
        }
        return
      }

      let derived
      try {
        derived = await deriveExecKeypair(cached.prfOutput)
      } catch (error) {
        logError('Failed to derive exec keypair', error, {
          component: 'useExecSnapshot',
          action: 'deriveExecKeypair',
        })
        if (!cancelled && activeChatRef.current === chatId) {
          setIsLoading(false)
        }
        return
      }

      const pubB64 = uint8ArrayToBase64Url(derived.pubKey)
      if (!cancelled && activeChatRef.current === chatId) {
        setExecPubkey(pubB64)
      }

      try {
        const dek = await fetchAndUnwrapDEK(
          chatId,
          derived.privKey,
          derived.pubKey,
        )
        if (cancelled || activeChatRef.current !== chatId) {
          return
        }
        if (dek) {
          setExecResumeDek(uint8ArrayToBase64Url(dek))
          logInfo('Loaded exec snapshot resume DEK', {
            component: 'useExecSnapshot',
            metadata: { chatId },
          })
        }
      } catch (error) {
        if (!cancelled && activeChatRef.current === chatId) {
          if (error instanceof SnapshotDecryptionFailedError) {
            setDecryptionFailed(true)
          }
          logError('Failed to load exec snapshot DEK', error, {
            component: 'useExecSnapshot',
            metadata: { chatId },
          })
        }
      } finally {
        // Drop the privkey reference as soon as we're done with it. JS will
        // GC it; we don't keep it around in state.
        derived.privKey.fill(0)
        if (!cancelled && activeChatRef.current === chatId) {
          setIsLoading(false)
        }
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [chatId, isSignedIn])

  return {
    execPubkey,
    execResumeDek,
    decryptionFailed,
    isLoading,
    consumeResumeDek,
    clearDecryptionFailed,
  }
}
