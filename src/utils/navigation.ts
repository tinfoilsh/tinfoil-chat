import type { MouseEvent } from 'react'

type LinkClick = Pick<
  MouseEvent<HTMLAnchorElement>,
  'altKey' | 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey'
>

interface ChatPathOptions {
  isLocalOnly?: boolean
  projectId?: string
}

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

export function getNewChatPath(projectId?: string): string {
  return projectId ? `/project/${projectId}` : '/newchat'
}
