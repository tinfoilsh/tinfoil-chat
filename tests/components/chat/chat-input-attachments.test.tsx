import { ChatInput } from '@/components/chat/chat-input'
import { CONSTANTS } from '@/components/chat/constants'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/project', () => ({
  ProjectModeBanner: () => null,
  useProject: () => ({
    isProjectMode: false,
    activeProject: null,
    loadingProject: false,
  }),
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock('@/components/chat/hooks/use-chat-font', () => ({
  CHAT_FONT_CLASSES: { default: '' },
  useChatFont: () => 'default',
}))

function renderChatInput(handleDocumentUpload: (file: File) => Promise<void>) {
  return render(
    <ChatInput
      input=""
      setInput={vi.fn()}
      handleSubmit={vi.fn()}
      loadingState="idle"
      cancelGeneration={vi.fn()}
      inputRef={createRef<HTMLTextAreaElement>()}
      handleInputFocus={vi.fn()}
      inputMinHeight="40px"
      isDarkMode
      handleDocumentUpload={handleDocumentUpload}
    />,
  )
}

describe('ChatInput attachments', () => {
  it('uploads pasted images as attachments', async () => {
    const handleDocumentUpload = vi.fn().mockResolvedValue(undefined)
    renderChatInput(handleDocumentUpload)
    const image = new File(['image'], 'clipboard.png', { type: 'image/png' })

    fireEvent.paste(screen.getByRole('textbox'), {
      clipboardData: {
        items: [
          {
            type: image.type,
            getAsFile: () => image,
          },
        ],
        getData: () => '',
      },
    })

    await waitFor(() =>
      expect(handleDocumentUpload).toHaveBeenCalledWith(image),
    )
  })

  it('uploads long pasted text as an attachment', async () => {
    const handleDocumentUpload = vi.fn().mockResolvedValue(undefined)
    renderChatInput(handleDocumentUpload)
    const pastedText = 'a'.repeat(CONSTANTS.LONG_PASTE_THRESHOLD + 1)

    fireEvent.paste(screen.getByRole('textbox'), {
      clipboardData: {
        items: [],
        getData: () => pastedText,
      },
    })

    await waitFor(() => expect(handleDocumentUpload).toHaveBeenCalledOnce())
    const file = handleDocumentUpload.mock.calls[0][0] as File
    expect(file.name).toMatch(/^pasted-text-.*\.txt$/)
    expect(await file.text()).toBe(pastedText)
  })

  it('uploads selected files through the attachment callback', async () => {
    const handleDocumentUpload = vi.fn().mockResolvedValue(undefined)
    const { container } = renderChatInput(handleDocumentUpload)
    const file = new File(['content'], 'notes.txt', { type: 'text/plain' })
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')

    expect(input).not.toBeNull()
    fireEvent.change(input!, { target: { files: [file] } })

    await waitFor(() => expect(handleDocumentUpload).toHaveBeenCalledWith(file))
  })
})
