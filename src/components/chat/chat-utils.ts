import React from 'react'
import type { Chat } from './types'

export class ChatError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message)
    this.name = 'ChatError'
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
    localStorage.setItem('chats', JSON.stringify(updatedChats))

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
