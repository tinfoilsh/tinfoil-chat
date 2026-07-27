import { MessageQueue } from '@/components/chat/message-queue'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('MessageQueue', () => {
  it('renders image attachments for queued messages', () => {
    render(
      <MessageQueue
        queue={[
          {
            id: 'queued-1',
            text: '',
            attachments: [
              {
                id: 'image-1',
                type: 'image',
                fileName: 'cat.png',
                mimeType: 'image/png',
                thumbnailBase64: 'thumbnail-data',
                base64: 'full-data',
              },
            ],
          },
        ]}
        onRemove={vi.fn()}
        onSend={vi.fn()}
      />,
    )

    const image = screen.getByRole('img', { name: 'cat.png' })
    expect(image).toHaveAttribute('src', 'data:image/png;base64,thumbnail-data')
  })

  it('sends the clicked queued message via the send button', () => {
    const onSend = vi.fn()
    const onRemove = vi.fn()
    render(
      <MessageQueue
        queue={[
          { id: 'queued-1', text: 'first' },
          { id: 'queued-2', text: 'second' },
        ]}
        onRemove={onRemove}
        onSend={onSend}
      />,
    )

    const sendButtons = screen.getAllByRole('button', {
      name: 'Send queued message now',
    })
    expect(sendButtons).toHaveLength(2)

    fireEvent.click(sendButtons[1])
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledWith('queued-2')
    expect(onRemove).not.toHaveBeenCalled()
  })
})
