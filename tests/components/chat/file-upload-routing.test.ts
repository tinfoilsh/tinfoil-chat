import { routeChatFileUpload } from '@/components/chat/file-upload-routing'
import { describe, expect, it, vi } from 'vitest'

describe('routeChatFileUpload', () => {
  const file = new File(['content'], 'notes.txt', { type: 'text/plain' })

  it('asks for a destination when a project is active', async () => {
    const requestDestination = vi.fn()
    const processFileForChat = vi.fn().mockResolvedValue(undefined)

    await routeChatFileUpload(file, {
      isProjectMode: true,
      hasActiveProject: true,
      requestDestination,
      processFileForChat,
    })

    expect(requestDestination).toHaveBeenCalledWith(file)
    expect(processFileForChat).not.toHaveBeenCalled()
  })

  it('uploads directly to chat outside project mode', async () => {
    const requestDestination = vi.fn()
    const processFileForChat = vi.fn().mockResolvedValue(undefined)

    await routeChatFileUpload(file, {
      isProjectMode: false,
      hasActiveProject: false,
      requestDestination,
      processFileForChat,
    })

    expect(processFileForChat).toHaveBeenCalledWith(file)
    expect(requestDestination).not.toHaveBeenCalled()
  })
})
