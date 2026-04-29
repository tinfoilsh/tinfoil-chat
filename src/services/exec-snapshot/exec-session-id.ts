/**
 * Exec Session ID
 *
 * Each chat that uses code execution gets its own client-generated 16-byte
 * identifier, base64url-encoded (no padding). Sent as X-Session-Id on code-exec
 * requests so the controlplane never sees a direct chat-id ↔ exec-snapshot
 * correlation.
 *
 * Kept distinct from `chat.id` (which still does its existing reverse-timestamp
 * sort-key job).
 */
import { uint8ArrayToBase64Url } from '@/utils/binary-codec'

/**
 * Generate a fresh execSessionId (16 random bytes, base64url, no padding).
 */
export function generateExecSessionId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return uint8ArrayToBase64Url(bytes)
}
