'use client'

import {
  CloudArrowUpIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { useEffect, useRef, useState } from 'react'
import { CiFloppyDisk } from 'react-icons/ci'
import { FaLock } from '../icons/lazy-icons'
import { cn } from '../ui/utils'
import { formatRelativeTime } from './chat-list-utils'
import { TypingAnimation } from './typing-animation'

export interface ChatItemData {
  id: string
  title: string
  isBlankChat?: boolean
  createdAt?: Date | string
  updatedAt?: string
  messageCount?: number
  messages?: { length: number }
  decryptionFailed?: boolean
  dataCorrupted?: boolean
  isLocalOnly?: boolean
  pendingSave?: boolean
}

/**
 * Generates a unique key for a chat item, handling blank chats specially
 */
export function getChatKey(chat: ChatItemData): string {
  if (chat.isBlankChat) {
    return `blank-${chat.isLocalOnly ? 'local' : 'cloud'}`
  }
  return chat.id
}

/**
 * Generates the ID to pass to onSelectChat for blank chats
 */
export function getBlankChatSelectId(chat: ChatItemData): string {
  return chat.isLocalOnly ? 'blank-local' : 'blank-cloud'
}

interface ChatListItemProps {
  chat: ChatItemData
  isSelected: boolean
  isEditing: boolean
  editingTitle: string
  isDarkMode: boolean
  showEncryptionStatus?: boolean
  showSyncStatus?: boolean
  enableTitleAnimation?: boolean
  onSelect: () => void
  onStartEdit: () => void
  onTitleChange: (title: string) => void
  onSaveTitle: () => void
  onCancelEdit: () => void
  onRequestDelete: () => void
}

export function ChatListItem({
  chat,
  isSelected,
  isEditing,
  editingTitle,
  isDarkMode,
  showEncryptionStatus = false,
  showSyncStatus = false,
  enableTitleAnimation = false,
  onSelect,
  onStartEdit,
  onTitleChange,
  onSaveTitle,
  onCancelEdit,
  onRequestDelete,
}: ChatListItemProps) {
  const [displayTitle, setDisplayTitle] = useState(chat.title)
  const [isAnimating, setIsAnimating] = useState(false)
  const [animationFromTitle, setAnimationFromTitle] = useState('')
  const [animationToTitle, setAnimationToTitle] = useState('')
  const prevTitleRef = useRef(chat.title)

  const messageCount = chat.messages?.length ?? chat.messageCount ?? 0
  const isNewChat = messageCount === 0 && !chat.decryptionFailed

  useEffect(() => {
    if (
      enableTitleAnimation &&
      prevTitleRef.current !== chat.title &&
      chat.title !== 'Untitled' &&
      prevTitleRef.current !== ''
    ) {
      setAnimationFromTitle(prevTitleRef.current)
      setAnimationToTitle(chat.title)
      setIsAnimating(true)
    } else {
      setDisplayTitle(chat.title)
      prevTitleRef.current = chat.title
    }
  }, [chat.title, enableTitleAnimation])

  const handleAnimationComplete = () => {
    setDisplayTitle(chat.title)
    setIsAnimating(false)
    prevTitleRef.current = chat.title
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (editingTitle.trim()) {
      onSaveTitle()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancelEdit()
    }
  }

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    onStartEdit()
  }

  const handleRequestDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    onRequestDelete()
  }

  const getTimestamp = (): Date | null => {
    if (chat.updatedAt) {
      return new Date(chat.updatedAt)
    }
    if (chat.createdAt) {
      return chat.createdAt instanceof Date
        ? chat.createdAt
        : new Date(chat.createdAt)
    }
    return null
  }

  const timestamp = getTimestamp()

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
        chat.decryptionFailed
          ? 'text-content-muted hover:bg-surface-chat'
          : isSelected
            ? isDarkMode
              ? 'bg-surface-chat text-white'
              : 'bg-gray-200 text-content-primary'
            : isDarkMode
              ? 'text-content-secondary hover:bg-surface-chat'
              : 'text-content-secondary hover:bg-surface-sidebar',
      )}
    >
      <div className="min-w-0 flex-1 pr-2">
        {isEditing ? (
          <form
            onSubmit={handleSubmit}
            className="w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              className="w-full rounded bg-surface-sidebar px-2 py-1 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={editingTitle}
              onChange={(e) => onTitleChange(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          </form>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              {showEncryptionStatus && chat.decryptionFailed && (
                <FaLock
                  className="h-3.5 w-3.5 flex-shrink-0 text-orange-500"
                  title="Encrypted chat"
                />
              )}
              <div
                className={cn(
                  'truncate font-aeonik-fono text-sm font-medium',
                  chat.decryptionFailed
                    ? 'text-orange-500'
                    : 'text-content-primary',
                )}
              >
                {chat.decryptionFailed ? (
                  'Encrypted'
                ) : isAnimating ? (
                  <TypingAnimation
                    fromText={animationFromTitle}
                    toText={animationToTitle}
                    onComplete={handleAnimationComplete}
                  />
                ) : (
                  displayTitle
                )}
              </div>
              {isNewChat && (
                <div
                  className="h-1.5 w-1.5 rounded-full bg-blue-500"
                  title="New chat"
                />
              )}
            </div>
            {(chat.decryptionFailed ||
              (messageCount > 0 && timestamp) ||
              (showSyncStatus &&
                (chat.isLocalOnly ||
                  (!chat.isBlankChat && chat.pendingSave)))) && (
              <div className="mt-1 flex min-h-[16px] w-full items-center gap-2">
                {chat.decryptionFailed ? (
                  <div className="text-xs text-red-500">
                    {chat.dataCorrupted
                      ? 'Failed to decrypt: corrupted data'
                      : 'Failed to decrypt: wrong key'}
                  </div>
                ) : messageCount > 0 && timestamp ? (
                  <div className="text-xs leading-none text-content-muted">
                    {formatRelativeTime(timestamp)}
                  </div>
                ) : null}
                {showSyncStatus && (
                  <>
                    {chat.isLocalOnly ? (
                      <>
                        {messageCount > 0 && (
                          <span className="text-xs text-content-muted">·</span>
                        )}
                        <span className="flex items-center gap-0.5 text-xs leading-none text-content-muted">
                          <CiFloppyDisk className="h-3 w-3" />
                          Only saved locally
                        </span>
                      </>
                    ) : !chat.isBlankChat && chat.pendingSave ? (
                      <>
                        {messageCount > 0 && (
                          <span className="text-xs text-content-muted">·</span>
                        )}
                        <span className="flex items-center gap-0.5 text-xs leading-none text-orange-500">
                          <CloudArrowUpIcon className="h-3 w-3" />
                          Syncing with cloud
                        </span>
                      </>
                    ) : null}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {!isEditing && (
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <div className="hidden items-center md:group-hover:flex">
            {!chat.decryptionFailed && !chat.isBlankChat && (
              <button
                className={cn(
                  'mr-1 rounded p-1 transition-colors',
                  isDarkMode
                    ? 'text-content-muted hover:bg-surface-chat hover:text-white'
                    : 'text-content-muted hover:bg-surface-sidebar hover:text-content-secondary',
                )}
                onClick={handleStartEdit}
                title="Rename"
              >
                <PencilSquareIcon className="h-4 w-4" />
              </button>
            )}
            {!chat.isBlankChat && (
              <button
                className={cn(
                  'rounded p-1 transition-colors',
                  isDarkMode
                    ? 'text-content-muted hover:bg-surface-chat hover:text-white'
                    : 'text-content-muted hover:bg-surface-sidebar hover:text-content-secondary',
                )}
                onClick={handleRequestDelete}
                title="Delete"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center md:hidden">
            {!chat.decryptionFailed && !chat.isBlankChat && (
              <button
                className={cn(
                  'mr-1 rounded p-1 transition-colors',
                  isDarkMode
                    ? 'text-content-muted hover:bg-surface-chat hover:text-white'
                    : 'text-content-muted hover:bg-surface-sidebar hover:text-content-secondary',
                )}
                onClick={handleStartEdit}
                title="Rename"
              >
                <PencilSquareIcon className="h-4 w-4" />
              </button>
            )}
            {!chat.isBlankChat && (
              <button
                className={cn(
                  'rounded p-1 transition-colors',
                  isDarkMode
                    ? 'text-content-muted hover:bg-surface-chat hover:text-white'
                    : 'text-content-muted hover:bg-surface-sidebar hover:text-content-secondary',
                )}
                onClick={handleRequestDelete}
                title="Delete"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </button>
  )
}
