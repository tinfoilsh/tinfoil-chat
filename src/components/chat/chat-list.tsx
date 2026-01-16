'use client'

import { useEffect, useState } from 'react'
import { cn } from '../ui/utils'
import {
  type ChatItemData,
  ChatListItem,
  getBlankChatSelectId,
  getChatKey,
} from './chat-list-item'
import { DeleteConfirmation } from './delete-confirmation'

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded bg-content-muted/20', className)}
    />
  )
}

interface ChatListProps {
  chats: ChatItemData[]
  currentChatId?: string
  currentChatIsBlank?: boolean
  currentChatIsLocalOnly?: boolean
  isDarkMode: boolean
  isLoading?: boolean
  showEncryptionStatus?: boolean
  showSyncStatus?: boolean
  enableTitleAnimation?: boolean
  animatedDeleteConfirmation?: boolean
  onSelectChat: (chatId: string) => void
  onAfterSelect?: () => void
  onUpdateTitle?: (chatId: string, title: string) => void
  onDeleteChat: (chatId: string) => void
  onEncryptionKeyClick?: () => void
  loadMoreButton?: React.ReactNode
  emptyState?: React.ReactNode
}

export function ChatList({
  chats,
  currentChatId,
  currentChatIsBlank,
  currentChatIsLocalOnly,
  isDarkMode,
  isLoading = false,
  showEncryptionStatus = false,
  showSyncStatus = false,
  enableTitleAnimation = false,
  animatedDeleteConfirmation = true,
  onSelectChat,
  onAfterSelect,
  onUpdateTitle,
  onDeleteChat,
  onEncryptionKeyClick,
  loadMoreButton,
  emptyState,
}: ChatListProps) {
  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null)
  // Track chat IDs that were manually edited - skip animation for these
  const [manuallyEditedChatId, setManuallyEditedChatId] = useState<
    string | null
  >(null)

  // Clear the manually edited flag after the title update has propagated
  useEffect(
    () => {
      if (manuallyEditedChatId) {
        setManuallyEditedChatId(null)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally only depends on chats
    [chats],
  )

  const isSelected = (chat: ChatItemData): boolean => {
    if (chat.isBlankChat) {
      return (
        currentChatIsBlank === true &&
        chat.isLocalOnly === currentChatIsLocalOnly
      )
    }
    return currentChatId === chat.id
  }

  const handleSelect = (chat: ChatItemData) => {
    if (chat.decryptionFailed) {
      onEncryptionKeyClick?.()
      return
    }

    if (chat.isBlankChat) {
      onSelectChat(getBlankChatSelectId(chat))
    } else {
      onSelectChat(chat.id)
    }

    onAfterSelect?.()
  }

  const handleStartEdit = (chat: ChatItemData) => {
    setEditingTitle(chat.title)
    setEditingChatId(chat.id)
  }

  const handleSaveTitle = (chatId: string) => {
    if (editingTitle.trim() && onUpdateTitle) {
      // Mark this chat as manually edited to skip animation
      setManuallyEditedChatId(chatId)
      onUpdateTitle(chatId, editingTitle.trim())
    }
    setEditingChatId(null)
  }

  const handleCancelEdit = () => {
    setEditingChatId(null)
  }

  const handleConfirmDelete = (chatId: string) => {
    onDeleteChat(chatId)
    setDeletingChatId(null)
  }

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              'rounded-lg px-3 py-2',
              isDarkMode ? 'bg-surface-chat' : 'bg-white',
            )}
          >
            <Shimmer className="mb-2 h-4 w-3/4" />
            <Shimmer className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  if (chats.length === 0 && emptyState) {
    return <div className="p-2">{emptyState}</div>
  }

  return (
    <div className="space-y-2 p-2">
      {chats.map((chat) => (
        <div key={getChatKey(chat)} className="relative">
          <ChatListItem
            chat={chat}
            isSelected={isSelected(chat)}
            isEditing={editingChatId === chat.id}
            editingTitle={editingTitle}
            isDarkMode={isDarkMode}
            showEncryptionStatus={showEncryptionStatus}
            showSyncStatus={showSyncStatus}
            enableTitleAnimation={
              enableTitleAnimation && manuallyEditedChatId !== chat.id
            }
            onSelect={() => handleSelect(chat)}
            onStartEdit={() => handleStartEdit(chat)}
            onTitleChange={setEditingTitle}
            onSaveTitle={() => handleSaveTitle(chat.id)}
            onCancelEdit={handleCancelEdit}
            onRequestDelete={() => setDeletingChatId(chat.id)}
          />
          {deletingChatId === chat.id && (
            <DeleteConfirmation
              onConfirm={() => handleConfirmDelete(chat.id)}
              onCancel={() => setDeletingChatId(null)}
              isDarkMode={isDarkMode}
              animated={animatedDeleteConfirmation}
            />
          )}
        </div>
      ))}
      {loadMoreButton}
    </div>
  )
}

export { type ChatItemData } from './chat-list-item'
