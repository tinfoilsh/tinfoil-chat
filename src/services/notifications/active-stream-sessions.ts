/**
 * Tracks the EHBP recovery session ID of the live stream per chat. The
 * stream-completion push notification watch is keyed by this session ID, so
 * the notify banner needs to know which session the current chat's response
 * is streaming under (including when retries swap in a fresh session).
 */

type Listener = () => void

const sessionsByChat = new Map<string, string>()
const listeners = new Set<Listener>()
let snapshot: ReadonlyMap<string, string> = new Map()

function publish(): void {
  snapshot = new Map(sessionsByChat)
  listeners.forEach((listener) => listener())
}

export function subscribeActiveStreamSessions(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getActiveStreamSessionSnapshot(): ReadonlyMap<string, string> {
  return snapshot
}

export function setActiveStreamSession(
  chatId: string,
  sessionId: string,
): void {
  if (sessionsByChat.get(chatId) === sessionId) return
  sessionsByChat.set(chatId, sessionId)
  publish()
}

export function clearActiveStreamSession(
  chatId: string,
  sessionId?: string,
): void {
  if (!sessionsByChat.has(chatId)) return
  if (sessionId !== undefined && sessionsByChat.get(chatId) !== sessionId) {
    return
  }
  sessionsByChat.delete(chatId)
  publish()
}
