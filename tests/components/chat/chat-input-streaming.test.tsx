import { ChatInput } from '@/components/chat/chat-input'
import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const projectState = vi.hoisted(() => ({
  isProjectMode: false,
  activeProject: null as { name: string; color?: string } | null,
  loadingProject: false,
}))

vi.mock('@/components/project', () => ({
  ProjectModeBanner: ({ projectName }: { projectName: string }) => (
    <div data-testid="project-mode-banner">{projectName}</div>
  ),
  useProject: () => projectState,
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock('@/components/chat/hooks/use-chat-font', () => ({
  CHAT_FONT_CLASSES: { default: '' },
  useChatFont: () => 'default',
}))

afterEach(() => {
  projectState.isProjectMode = false
  projectState.activeProject = null
  projectState.loadingProject = false
})

describe('ChatInput streaming action', () => {
  it('shows Stop while a recovered response is streaming', () => {
    const cancelGeneration = vi.fn()
    render(
      <ChatInput
        input=""
        setInput={vi.fn()}
        handleSubmit={vi.fn()}
        loadingState="streaming"
        cancelGeneration={cancelGeneration}
        inputRef={createRef<HTMLTextAreaElement>()}
        handleInputFocus={vi.fn()}
        inputMinHeight="40px"
        isDarkMode
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Stop generation' }))

    expect(cancelGeneration).toHaveBeenCalledOnce()
    expect(
      screen.queryByRole('button', { name: 'Send' }),
    ).not.toBeInTheDocument()
  })

  it('returns to the Send action as soon as cancellation is reflected', () => {
    const props = {
      input: '',
      setInput: vi.fn(),
      handleSubmit: vi.fn(),
      cancelGeneration: vi.fn(),
      inputRef: createRef<HTMLTextAreaElement>(),
      handleInputFocus: vi.fn(),
      inputMinHeight: '40px',
      isDarkMode: true,
    }
    const { rerender } = render(
      <ChatInput {...props} loadingState="streaming" />,
    )

    rerender(<ChatInput {...props} loadingState="idle" />)

    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Stop generation' }),
    ).not.toBeInTheDocument()
  })
})

describe('ChatInput indicators', () => {
  it('keeps the prompt indicator in flow below the project banner on mobile', () => {
    projectState.isProjectMode = true
    projectState.activeProject = { name: 'Mobile project' }

    render(
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
        activePromptPreset={{
          id: 'custom-prompt',
          name: 'Custom prompt',
          description: '',
          Icon: () => null,
          systemPrompt: 'Be concise.',
          isBuiltIn: false,
        }}
        onOpenPromptLibrary={vi.fn()}
      />,
    )

    const projectBanner = screen.getByTestId('project-mode-banner')
    const promptButton = screen.getByRole('button', {
      name: 'Change prompt (currently Custom prompt)',
    })
    const promptIndicator = promptButton.parentElement?.parentElement

    expect(promptIndicator?.classList.contains('relative')).toBe(true)
    expect(promptIndicator?.classList.contains('md:absolute')).toBe(true)
    expect(promptIndicator?.classList.contains('absolute')).toBe(false)
    expect(
      projectBanner.compareDocumentPosition(promptIndicator!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)
  })
})
