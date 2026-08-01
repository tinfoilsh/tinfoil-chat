import {
  ChatListItem,
  type ChatItemData,
} from '@/components/chat/chat-list-item'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const savedChat: ChatItemData = {
  id: 'chat-123',
  title: 'Trip planning',
  messageCount: 2,
}

function renderChatListItem({
  href,
  onSelect = vi.fn(),
  chat = savedChat,
  isSelected = false,
  pixelateSidebarChatTitles,
}: {
  href?: string
  onSelect?: () => void
  chat?: ChatItemData
  isSelected?: boolean
  pixelateSidebarChatTitles?: boolean
} = {}) {
  render(
    <ChatListItem
      chat={chat}
      href={href}
      isSelected={isSelected}
      isEditing={false}
      editingTitle=""
      isDarkMode={false}
      pixelateSidebarChatTitles={pixelateSidebarChatTitles}
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

  it('preserves modified- and middle-click link behavior', () => {
    const onSelect = renderChatListItem({ href: '/chat/chat-123' })
    const link = screen.getByRole('link')

    fireEvent.click(link, { ctrlKey: true })
    fireEvent(link, new MouseEvent('auxclick', { bubbles: true, button: 1 }))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('renders chats without destinations as buttons', () => {
    const onSelect = renderChatListItem()

    fireEvent.click(screen.getByRole('button', { name: /Trip planning/ }))
    expect(onSelect).toHaveBeenCalledOnce()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('ChatListItem title privacy', () => {
  it('pixelates inactive saved chat titles by default', () => {
    renderChatListItem()

    expect(screen.getByText('Trip planning').parentElement).toHaveClass(
      'sidebar-chat-title-pixelated',
    )
    expect(screen.getByText('Trip planning').parentElement).toHaveAttribute(
      'data-pixelated-title',
      '■■■■ ■■■■■■■■',
    )
  })

  it('keeps the active chat title clear', () => {
    renderChatListItem({ isSelected: true })

    expect(screen.getByText('Trip planning').parentElement).not.toHaveClass(
      'sidebar-chat-title-pixelated',
    )
  })

  it('keeps the new chat title clear', () => {
    renderChatListItem({
      chat: {
        id: 'blank-chat',
        title: 'New Chat',
        isBlankChat: true,
        messageCount: 0,
      },
    })

    expect(screen.getByText('New Chat').parentElement).not.toHaveClass(
      'sidebar-chat-title-pixelated',
    )
  })

  it('keeps saved chat titles clear when pixelation is disabled', () => {
    renderChatListItem({ pixelateSidebarChatTitles: false })

    expect(screen.getByText('Trip planning').parentElement).not.toHaveClass(
      'sidebar-chat-title-pixelated',
    )
  })
})
