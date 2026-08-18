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
  if (source !== 'favorites') return false
  if (pinnedChatIds.includes(chatId)) onRemoveFavorite?.(chatId)
  return true
}
