import {
  ChatListItem,
  type ChatItemData,
} from '@/components/chat/chat-list-item'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const chat: ChatItemData = {
  id: 'chat-123',
  title: 'Trip planning',
  messageCount: 2,
}

function renderChatListItem({
  href,
  onSelect = vi.fn(),
}: {
  href?: string
  onSelect?: () => void
} = {}) {
  render(
    <ChatListItem
      chat={chat}
      href={href}
      isSelected={false}
      isEditing={false}
      editingTitle=""
      isDarkMode={false}
      onSelect={onSelect}
      onStartEdit={vi.fn()}
      onTitleChange={vi.fn()}
      onSaveTitle={vi.fn()}
      onCancelEdit={vi.fn()}
      onRequestDelete={vi.fn()}
    />,
  )
  return onSelect
}

describe('ChatListItem navigation semantics', () => {
  it('renders persistent chats as links and handles ordinary clicks in place', () => {
    const onSelect = renderChatListItem({ href: '/chat/chat-123' })
    const link = screen.getByRole('link', { name: /Trip planning/ })

    expect(link).toHaveAttribute('href', '/chat/chat-123')
    fireEvent.click(link)
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('preserves modified-click link behavior', () => {
    const onSelect = renderChatListItem({ href: '/chat/chat-123' })

    fireEvent.click(screen.getByRole('link'), { ctrlKey: true })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('renders chats without destinations as buttons', () => {
    const onSelect = renderChatListItem()

    fireEvent.click(screen.getByRole('button', { name: /Trip planning/ }))
    expect(onSelect).toHaveBeenCalledOnce()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
