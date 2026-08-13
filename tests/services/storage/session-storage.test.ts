import type { Chat } from '@/components/chat/types'
import {
  SYNC_SESSION_CHAT_DRAFT_PREFIX,
  SYNC_SESSION_CHATS,
} from '@/constants/storage-keys'
import { sessionChatStorage } from '@/services/storage/session-storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/error-handling', () => ({
  logError: vi.fn(),
}))

function chat(id: string, content: string): Chat {
  return {
    id,
    title: id,
    messages: [
      {
        role: 'assistant',
        content,
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    isBlankChat: false,
  }
}

describe('sessionChatStorage streaming drafts', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('merges a streaming draft without rewriting the chat collection', () => {
    const persisted = chat('chat-1', 'partial')
    sessionChatStorage.saveChat(persisted)
    const collectionBeforeDraft = sessionStorage.getItem(SYNC_SESSION_CHATS)

    sessionChatStorage.saveStreamingDraft(chat('chat-1', 'partial response'))

    expect(sessionStorage.getItem(SYNC_SESSION_CHATS)).toBe(
      collectionBeforeDraft,
    )
    expect(sessionChatStorage.getChat('chat-1')?.messages[0].content).toBe(
      'partial response',
    )
  })

  it('clears the draft after a terminal save', () => {
    sessionChatStorage.saveChat(chat('chat-1', 'before'))
    sessionChatStorage.saveStreamingDraft(chat('chat-1', 'streaming'))

    sessionChatStorage.saveChat(chat('chat-1', 'complete'))

    expect(
      sessionStorage.getItem(`${SYNC_SESSION_CHAT_DRAFT_PREFIX}chat-1`),
    ).toBeNull()
    expect(sessionChatStorage.getChat('chat-1')?.messages[0].content).toBe(
      'complete',
    )
  })

  it('clears drafts when chats are deleted or storage is cleared', () => {
    sessionChatStorage.saveChat(chat('chat-1', 'before'))
    sessionChatStorage.saveStreamingDraft(chat('chat-1', 'streaming'))
    sessionChatStorage.deleteChat('chat-1')
    expect(sessionChatStorage.getChat('chat-1')).toBeNull()

    sessionChatStorage.saveStreamingDraft(chat('chat-2', 'streaming'))
    sessionChatStorage.clearAll()
    expect(sessionChatStorage.getAllChats()).toEqual([])
  })
})
