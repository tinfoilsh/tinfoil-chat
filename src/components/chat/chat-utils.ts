import React from 'react'
import type { Chat, Message } from './types'

export class ChatError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message)
    this.name = 'ChatError'
  }
}

export function updateChat(
  chats: Chat[],
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>,
  currentChat: Chat,
  setCurrentChat: React.Dispatch<React.SetStateAction<Chat>>,
  chatId: string,
  updatedMessages: Message[],
  isUserMessage: boolean,
  skipPersist = false,
) {
  setChats((prevChats: Chat[]) => {
    const newChats = prevChats.map((chat: Chat) =>
      chat.id === chatId
        ? { ...chat, messages: updatedMessages, isUserMessage }
        : chat,
    )

    // Only save to localStorage if not skipping persist
    if (!skipPersist) {
      localStorage.setItem('chats', JSON.stringify(newChats))
    }

    return newChats
  })

  if (currentChat?.id === chatId) {
    setCurrentChat((prev: Chat) => ({
      ...prev,
      messages: updatedMessages,
      isUserMessage,
    }))
  }
}

export function updateChatTitle(
  chats: Chat[],
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>,
  currentChat: Chat,
  setCurrentChat: React.Dispatch<React.SetStateAction<Chat>>,
  chatId: string,
  newTitle: string,
) {
  setChats((prevChats: Chat[]) => {
    const updatedChats = prevChats.map((chat: Chat) =>
      chat.id === chatId ? { ...chat, title: newTitle } : chat,
    )

    // Save updated chats to localStorage
    localStorage.setItem('chats', JSON.stringify(updatedChats))

    return updatedChats
  })

  if (currentChat?.id === chatId) {
    setCurrentChat((prev: Chat) => ({ ...prev, title: newTitle }))
  }
}
