import { useEffect, useState } from 'react'

export type ChatFont = 'default' | 'mono' | 'system' | 'dyslexic'

export const CHAT_FONT_CLASSES: Record<ChatFont, string> = {
  default: 'font-aeonik',
  mono: 'font-aeonik-fono',
  system: 'font-sans',
  dyslexic: 'font-opendyslexic',
}

export const useChatFont = () => {
  const [chatFont, setChatFont] = useState<ChatFont>('default')

  useEffect(() => {
    const loadChatFont = () => {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('chatFont')
        if (
          saved &&
          (saved === 'default' ||
            saved === 'mono' ||
            saved === 'system' ||
            saved === 'dyslexic')
        ) {
          setChatFont(saved)
        }
      }
    }

    loadChatFont()

    const handleStorageChange = (e: StorageEvent | CustomEvent) => {
      let key: string | null = null
      let newValue: string | null = null

      if (e instanceof StorageEvent) {
        key = e.key
        newValue = e.newValue
      } else if (e.type === 'chatFontChanged') {
        key = 'chatFont'
        newValue = (e as CustomEvent).detail
      }

      if (
        key === 'chatFont' &&
        newValue &&
        (newValue === 'default' ||
          newValue === 'mono' ||
          newValue === 'system' ||
          newValue === 'dyslexic')
      ) {
        setChatFont(newValue)
      }
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener(
      'chatFontChanged',
      handleStorageChange as EventListener,
    )
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener(
        'chatFontChanged',
        handleStorageChange as EventListener,
      )
    }
  }, [])

  return chatFont
}
