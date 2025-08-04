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

export function generateTitle(text: string): string {
  // Clean the text
  const cleanText = text
    .replace(/[^\w\s]/g, ' ') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()

  // Get words and filter out common words and very short words
  const words = cleanText.split(' ').filter((word) => {
    const lower = word.toLowerCase()
    // Skip common words and short words
    const commonWords = [
      // Articles
      'the',
      'a',
      'an',

      // Conjunctions
      'and',
      'or',
      'but',
      'nor',
      'yet',
      'so',
      'for',

      // Prepositions
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'up',
      'about',
      'into',
      'over',
      'after',
      'beneath',
      'under',
      'above',

      // Pronouns
      'i',
      'you',
      'he',
      'she',
      'it',
      'we',
      'they',
      'me',
      'him',
      'her',
      'us',
      'them',
      'my',
      'your',
      'his',
      'her',
      'its',
      'our',
      'their',
      'mine',
      'yours',
      'hers',
      'ours',
      'theirs',
      'this',
      'that',
      'these',
      'those',
      'who',
      'whom',
      'whose',
      'which',
      'what',

      // Auxiliary verbs
      'am',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'can',
      'could',
      'will',
      'would',
      'shall',
      'should',
      'may',
      'might',
      'must',

      // Common adverbs
      'very',
      'really',
      'just',
      'now',
      'then',
      'here',
      'there',
      'when',
      'where',
      'why',
      'how',
      'all',
      'any',
      'both',
      'each',
      'few',
      'more',
      'most',
      'other',
      'some',
      'such',

      // Common adjectives
      'new',
      'good',
      'high',
      'old',
      'great',
      'big',
      'small',
      'many',
      'own',
      'same',
      'few',
      'much',

      // Numbers and time words
      'one',
      'two',
      'three',
      'first',
      'last',
      'next',
      'time',
      'year',
      'day',
      'week',
      'month',

      // Other common words
      'like',
      'get',
      'go',
      'make',
      'know',
      'will',
      'think',
      'take',
      'see',
      'come',
      'well',
      'way',
      'also',
      'back',
      'even',
      'still',
      'way',
      'take',
      'every',
      'since',
      'please',
      'much',
      'want',
      'need',
      'right',
      'left',
    ]
    return word.length > 2 && !commonWords.includes(lower)
  })

  // Take first 4-5 meaningful words
  const title = words.slice(0, 5).join(' ')

  // Ensure reasonable length and capitalize first letter
  return title.length > 0
    ? (title.charAt(0).toUpperCase() + title.slice(1)).slice(0, 50)
    : 'New Chat'
}

export function updateChatTitle(
  chats: Chat[],
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
