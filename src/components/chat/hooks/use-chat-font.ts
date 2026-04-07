import { SETTINGS_CHAT_FONT } from '@/constants/storage-keys'
import { useEffect, useState } from 'react'

export type ChatFont = 'system' | 'serif' | 'mono' | 'dyslexic'

export const CHAT_FONT_CLASSES: Record<ChatFont, string> = {
  system: 'font-system',
  serif: 'font-lora',
  mono: 'font-aeonik-fono',
  dyslexic: 'font-opendyslexic',
}

export const normalizeChatFont = (
  value: string | null | undefined,
): ChatFont => {
  if (value === 'serif' || value === 'mono' || value === 'dyslexic') {
    return value
  }

  return 'system'
}

export const useChatFont = () => {
  const [chatFont, setChatFont] = useState<ChatFont>('system')

  useEffect(() => {
    const loadChatFont = () => {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(SETTINGS_CHAT_FONT)
        setChatFont(normalizeChatFont(saved))
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
        key = SETTINGS_CHAT_FONT
        newValue = (e as CustomEvent).detail
      }

      if (key === SETTINGS_CHAT_FONT) {
        setChatFont(normalizeChatFont(newValue))
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
