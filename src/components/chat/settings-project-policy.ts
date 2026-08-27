import type { Chat } from './types'

export function canDeleteAllProjects(isSignedIn: boolean): boolean {
  return isSignedIn
}

export function canTransferProjectData(isPremium: boolean): boolean {
  return isPremium
}

export function filterExportableChats(
  chats: Chat[],
  isPremium: boolean,
): Chat[] {
  return chats.filter(
    (chat) =>
      !chat.isBlankChat &&
      (isPremium || !chat.projectId) &&
      (chat.messageCount ?? chat.messages?.length ?? 0) > 0,
  )
}
