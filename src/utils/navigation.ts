import type { MouseEvent } from 'react'

type LinkClick = Pick<
  MouseEvent<HTMLAnchorElement>,
  'altKey' | 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey'
>

interface ChatPathOptions {
  isLocalOnly?: boolean
  projectId?: string
}

export const NEW_CHAT_STORAGE_QUERY_KEY = 'storage'
export const LOCAL_NEW_CHAT_STORAGE = 'local'

export function isPlainPrimaryClick(event: LinkClick): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  )
}

export function getChatPath(
  chatId: string,
  { isLocalOnly = false, projectId }: ChatPathOptions = {},
): string {
  if (projectId) return `/project/${projectId}/chat/${chatId}`
  if (isLocalOnly) return `/chat/local/${chatId}`
  return `/chat/${chatId}`
}

/**
 * Identifier embedded in a stream-completion push payload. The service
 * worker deep-links to `/chat/{watchChatId}`, so local-only chats carry the
 * `local/` route segment. Project chats use the bare id: `/chat/{id}` loads
 * them fine and the app canonicalizes the URL to the project route itself.
 * Must stay in sync with sanitizedChatId in public/firebase-messaging-sw.js.
 */
export function getPushWatchChatId(
  chatId: string,
  isLocalOnly: boolean,
): string {
  return isLocalOnly ? `local/${chatId}` : chatId
}

export function getNewChatPath({
  isLocalOnly = false,
  projectId,
}: ChatPathOptions = {}): string {
  if (projectId) return `/project/${projectId}`
  if (isLocalOnly) {
    return `/newchat?${NEW_CHAT_STORAGE_QUERY_KEY}=${LOCAL_NEW_CHAT_STORAGE}`
  }
  return '/newchat'
}

export function isLocalNewChatStorage(
  storage: string | string[] | undefined,
): boolean {
  return storage === LOCAL_NEW_CHAT_STORAGE
}
