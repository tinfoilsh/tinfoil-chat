import { useEffect, useState } from 'react'
import { CONSTANTS } from '../constants'

export const useMaxMessages = () => {
  const [maxMessages, setMaxMessages] = useState<number>(
    CONSTANTS.MAX_PROMPT_MESSAGES,
  )

  useEffect(() => {
    // Load setting from localStorage on mount
    const loadMaxMessages = () => {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('maxPromptMessages')
        if (saved) {
          const parsedValue = parseInt(saved, 10)
          if (!isNaN(parsedValue) && parsedValue > 0 && parsedValue <= 50) {
            setMaxMessages(parsedValue)
          }
        }
      }
    }

    loadMaxMessages()

    // Listen for storage changes (when updated in settings)
    const handleStorageChange = (e: StorageEvent | CustomEvent) => {
      let key: string | null = null
      let newValue: string | null = null

      if (e instanceof StorageEvent) {
        key = e.key
        newValue = e.newValue
      } else if (e.type === 'maxPromptMessagesChanged') {
        key = 'maxPromptMessages'
        newValue = (e as CustomEvent).detail.toString()
      }

      if (key === 'maxPromptMessages' && newValue) {
        const parsedValue = parseInt(newValue, 10)
        if (!isNaN(parsedValue) && parsedValue > 0 && parsedValue <= 50) {
          setMaxMessages(parsedValue)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener(
      'maxPromptMessagesChanged',
      handleStorageChange as EventListener,
    )
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener(
        'maxPromptMessagesChanged',
        handleStorageChange as EventListener,
      )
    }
  }, [])

  return maxMessages
}
