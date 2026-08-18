import type { ChatDragSource } from './drag-context'

interface ConsumeFavoriteDropOptions {
  source: ChatDragSource | null
  chatId: string
  pinnedChatIds: readonly string[]
  onRemoveFavorite?: (chatId: string) => void
}

export function consumeFavoriteDrop({
  source,
  chatId,
  pinnedChatIds,
  onRemoveFavorite,
}: ConsumeFavoriteDropOptions): boolean {
  if (
    source !== 'favorites' ||
    !pinnedChatIds.includes(chatId) ||
    !onRemoveFavorite
  ) {
    return false
  }
  onRemoveFavorite(chatId)
  return true
}
