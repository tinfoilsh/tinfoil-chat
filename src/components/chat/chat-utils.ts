import React from 'react'
import { CONSTANTS } from './constants'
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

export async function generateTitle(
  messages: Array<{ role: string; content: string }>,
  apiKey?: string | null,
  freeModelName?: string,
  freeModelEndpoint?: string,
): Promise<string> {
  // Return default if no messages
  if (!messages || messages.length === 0) {
    return 'New Chat'
  }

  // If no free model info provided, return default
  if (!freeModelName || !freeModelEndpoint) {
    return 'New Chat'
  }

  try {
    // Prepare conversation history for the title generator
    // Limit to first few exchanges to avoid token limits
    const conversationForTitle = messages
      .slice(0, Math.min(4, messages.length))
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content.slice(0, 500)}`)
      .join('\n\n')

    // Use the model's endpoint via the proxy
    const proxyUrl = `${CONSTANTS.INFERENCE_PROXY_URL}${freeModelEndpoint}`

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    // Add API key if available
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }

    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: freeModelName,
        messages: [
          {
            role: 'system',
            content: CONSTANTS.TITLE_GENERATION_PROMPT,
          },
          {
            role: 'user',
            content: `Generate a title for this conversation:\n\n${conversationForTitle}`,
          },
        ],
        stream: false,
        max_tokens: 30,
      }),
    })

    if (!response.ok) {
      return 'New Chat'
    }

    const data = await response.json()
    const title = data.choices?.[0]?.message?.content?.trim() || ''

    // Clean up the title (remove quotes if present)
    const cleanTitle = title.replace(/^["']|["']$/g, '').trim()

    // Validate and return the generated title
    if (cleanTitle && cleanTitle.length > 0 && cleanTitle.length <= 50) {
      return cleanTitle
    }

    return 'New Chat'
  } catch (error) {
    // If generation fails, just return default title
    return 'New Chat'
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
