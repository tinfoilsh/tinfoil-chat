import { SYNC_CHATS } from '@/constants/storage-keys'
import React from 'react'
import type { Chat } from './types'

/**
 * Structured error classification for chat request failures. Control flow
 * (retries, banners, rate-limit handling) must branch on these codes, never
 * on error message text, which varies across browsers, SDKs, and locales.
 */
export type ChatErrorCode =
  // Transport/network failure, including exhausted retries.
  | 'FETCH_ERROR'
  // Free-tier or per-request rate limit (HTTP 429 family).
  | 'RATE_LIMIT'
  // Per-account hourly usage cap.
  | 'HOURLY_LIMIT'

export class ChatError extends Error {
  /** HTTP status of the failed request, when one was received. */
  public status?: number

  constructor(
    message: string,
    public code: ChatErrorCode,
    options?: { status?: number },
  ) {
    super(message)
    this.name = 'ChatError'
    this.status = options?.status
  }
}

export function updateChatTitle(
  _chats: Chat[],
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>,
  currentChat: Chat,
  setCurrentChat: React.Dispatch<React.SetStateAction<Chat>>,
  chatId: string,
  newTitle: string,
) {
  setChats((prevChats) => {
    const updatedChats = prevChats.map((chat) =>
      chat.id === chatId
        ? { ...chat, title: newTitle, titleState: 'manual' as const }
        : chat,
    )

    // Save updated chats to localStorage
    localStorage.setItem(SYNC_CHATS, JSON.stringify(updatedChats))

    return updatedChats
  })

  if (currentChat?.id === chatId) {
    setCurrentChat((prev: Chat) => ({
      ...prev,
      title: newTitle,
      titleState: 'manual' as const,
    }))
  }
}
