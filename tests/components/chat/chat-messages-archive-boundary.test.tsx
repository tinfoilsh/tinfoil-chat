import { ChatMessages } from '@/components/chat/chat-messages'
import type { Message } from '@/components/chat/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/config/models', () => ({
  findSelectableModel: (_id: string, models: unknown[]) => models[0],
}))

vi.mock('@/components/chat/renderers/client', () => ({
  getRendererRegistry: () => ({
    getMessageRenderer: () => ({
      render: ({ message }: { message: Message }) => (
        <div data-testid={`message-${message.turnId}`}>{message.content}</div>
      ),
    }),
  }),
}))

vi.mock('@/hooks/use-chat-print', () => ({
  useChatPrint: () => undefined,
}))

vi.mock('@/components/chat/PrintableChat', () => ({
  PrintableChat: () => null,
}))

vi.mock('@/components/chat/WelcomeScreen', () => ({
  WelcomeScreen: () => null,
}))

const models = [{ id: 'model-1', contextWindowTokens: 1000 }] as any

function message(
  role: Message['role'],
  turnId: string,
  tokenCount: number,
  timestamp: number,
): Message {
  return {
    role,
    turnId,
    content: 'x'.repeat(tokenCount * 4),
    timestamp: new Date(timestamp),
  }
}

function props(chatId: string, messages: Message[]) {
  return {
    chatId,
    messages,
    contextWindowTokens: 1000,
    isDarkMode: false,
    models,
    selectedModel: 'model-1',
  }
}

describe('ChatMessages archive boundary', () => {
  it('does not hide visible messages as pending input consumes the budget', () => {
    const messages = [
      message('user', 'turn-1-user', 200, 1),
      message('assistant', 'turn-1-assistant', 200, 2),
      message('user', 'turn-2-user', 200, 3),
      message('assistant', 'turn-2-assistant', 200, 4),
    ]
    const { rerender } = render(
      <ChatMessages {...props('chat-1', messages)} pendingContextTokens={0} />,
    )

    expect(screen.getByTestId('message-turn-1-user')).toBeInTheDocument()

    rerender(
      <ChatMessages
        {...props('chat-1', messages)}
        pendingContextTokens={800}
      />,
    )

    expect(screen.getByTestId('message-turn-1-user')).toBeInTheDocument()
    expect(screen.getByTestId('message-turn-2-assistant')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /earlier messages/ }),
    ).not.toBeInTheDocument()
  })

  it('keeps the active turn visible as its assistant response grows', () => {
    const initialMessages = [
      message('user', 'old-user', 100, 1),
      message('assistant', 'old-assistant', 100, 2),
      message('user', 'active-user', 100, 3),
    ]
    const { rerender } = render(
      <ChatMessages
        {...props('chat-1', initialMessages)}
        isStreamingResponse
      />,
    )

    const streamingMessages = [
      ...initialMessages,
      message('assistant', 'active-assistant', 300, 4),
    ]
    rerender(
      <ChatMessages
        {...props('chat-1', streamingMessages)}
        isStreamingResponse
      />,
    )

    const grownMessages = [
      ...streamingMessages.slice(0, -1),
      message('assistant', 'active-assistant', 850, 4),
    ]
    rerender(
      <ChatMessages {...props('chat-1', grownMessages)} isStreamingResponse />,
    )

    expect(screen.getByTestId('message-active-user')).toBeInTheDocument()
    expect(screen.getByTestId('message-active-assistant')).toBeInTheDocument()
  })

  it('initializes a fresh collapsed prefix when the chat changes', () => {
    const shortChat = [message('user', 'short-message', 100, 1)]
    const longChat = [
      message('user', 'long-1', 300, 1),
      message('assistant', 'long-2', 300, 2),
      message('user', 'long-3', 300, 3),
      message('assistant', 'long-4', 300, 4),
    ]
    const { rerender } = render(
      <ChatMessages {...props('short-chat', shortChat)} />,
    )

    rerender(<ChatMessages {...props('long-chat', longChat)} />)

    expect(screen.queryByTestId('message-long-1')).not.toBeInTheDocument()
    expect(screen.getByTestId('message-long-2')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Show 1 earlier messages' }),
    ).toBeInTheDocument()
  })

  it('initializes the collapsed prefix when an existing chat hydrates', () => {
    const longChat = [
      message('user', 'hydrated-1', 300, 1),
      message('assistant', 'hydrated-2', 300, 2),
      message('user', 'hydrated-3', 300, 3),
      message('assistant', 'hydrated-4', 300, 4),
    ]
    const { rerender } = render(
      <ChatMessages {...props('hydrated-chat', [])} />,
    )

    rerender(<ChatMessages {...props('hydrated-chat', longChat)} />)

    expect(screen.queryByTestId('message-hydrated-1')).not.toBeInTheDocument()
    expect(screen.getByTestId('message-hydrated-2')).toBeInTheDocument()
  })
})
