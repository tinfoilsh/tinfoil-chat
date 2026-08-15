import { PINNED_CHAT_IDS_CHANGED_EVENT } from '@/constants/settings-events'
import { USER_PREFS_PINNED_CHAT_IDS } from '@/constants/storage-keys'
import { chatEvents } from '@/services/storage/chat-events'
import {
  addPinnedChatId,
  loadPinnedChatIds,
  removePinnedChatIds,
  savePinnedChatIds,
} from '@/services/storage/pinned-chats'
import { useCallback, useEffect, useState } from 'react'

export function usePinnedChats() {
  const [pinnedChatIds, setPinnedChatIds] = useState<string[]>(
    () => loadPinnedChatIds() ?? [],
  )

  useEffect(() => {
    const refresh = () => setPinnedChatIds(loadPinnedChatIds() ?? [])
    const handleStorage = (event: StorageEvent) => {
      if (event.key === USER_PREFS_PINNED_CHAT_IDS) refresh()
    }
    const unsubscribeChats = chatEvents.on((event) => {
      if (event.reason === 'delete-all') {
        savePinnedChatIds([])
        return
      }
      if (event.reason !== 'delete' || !event.ids?.length) return
      const current = loadPinnedChatIds() ?? []
      const next = removePinnedChatIds(current, event.ids)
      if (next.length !== current.length) savePinnedChatIds(next)
    })

    window.addEventListener(PINNED_CHAT_IDS_CHANGED_EVENT, refresh)
    window.addEventListener('storage', handleStorage)
    return () => {
      unsubscribeChats()
      window.removeEventListener(PINNED_CHAT_IDS_CHANGED_EVENT, refresh)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const pinChat = useCallback((chatId: string) => {
    const current = loadPinnedChatIds() ?? []
    savePinnedChatIds(addPinnedChatId(current, chatId))
  }, [])

  const unpinChat = useCallback((chatId: string) => {
    const current = loadPinnedChatIds() ?? []
    savePinnedChatIds(removePinnedChatIds(current, [chatId]))
  }, [])

  const unpinChats = useCallback((chatIds: readonly string[]) => {
    const current = loadPinnedChatIds() ?? []
    const next = removePinnedChatIds(current, chatIds)
    if (next.length !== current.length) savePinnedChatIds(next)
  }, [])

  return { pinnedChatIds, pinChat, unpinChat, unpinChats }
}
