import { openFavoriteChat } from '@/components/chat/favorite-navigation'
import { describe, expect, it, vi } from 'vitest'

describe('openFavoriteChat', () => {
  it('enters project context before opening the chat', async () => {
    const calls: string[] = []

    const opened = await openFavoriteChat({
      favorite: { id: 'chat-a', projectId: 'project-a' },
      isProjectMode: false,
      enterProjectMode: async () => {
        calls.push('project')
        return true
      },
      exitProjectMode: vi.fn(),
      openChat: async () => {
        calls.push('chat')
      },
      isCurrent: () => true,
    })

    expect(opened).toBe(true)
    expect(calls).toEqual(['project', 'chat'])
  })

  it('does not open after project failure or superseded navigation', async () => {
    const openChat = vi.fn(async () => {})
    const failed = await openFavoriteChat({
      favorite: { id: 'chat-a', projectId: 'project-a' },
      isProjectMode: false,
      enterProjectMode: async () => false,
      exitProjectMode: vi.fn(),
      openChat,
      isCurrent: () => true,
    })
    expect(failed).toBe(false)

    const stale = await openFavoriteChat({
      favorite: { id: 'chat-b', projectId: 'project-b' },
      isProjectMode: false,
      enterProjectMode: async () => true,
      exitProjectMode: vi.fn(),
      openChat,
      isCurrent: () => false,
    })
    expect(stale).toBe(false)
    expect(openChat).not.toHaveBeenCalled()
  })

  it('reloads context when the project id matches but project mode is inactive', async () => {
    const enterProjectMode = vi.fn(async () => true)

    await openFavoriteChat({
      favorite: { id: 'chat-a', projectId: 'project-a' },
      activeProjectId: 'project-a',
      isProjectMode: false,
      enterProjectMode,
      exitProjectMode: vi.fn(),
      openChat: vi.fn(async () => {}),
      isCurrent: () => true,
    })

    expect(enterProjectMode).toHaveBeenCalledWith(
      'project-a',
      expect.any(Function),
    )
  })

  it('does not open when normal navigation invalidates a pending favorite', async () => {
    let resolveProject: ((entered: boolean) => void) | undefined
    const projectLoad = new Promise<boolean>((resolve) => {
      resolveProject = resolve
    })
    let generation = 0
    const favoriteGeneration = ++generation
    const openChat = vi.fn(async () => {})
    const opening = openFavoriteChat({
      favorite: { id: 'favorite', projectId: 'project-a' },
      isProjectMode: false,
      enterProjectMode: () => projectLoad,
      exitProjectMode: vi.fn(),
      openChat,
      isCurrent: () => generation === favoriteGeneration,
    })

    generation += 1
    resolveProject?.(true)

    await expect(opening).resolves.toBe(false)
    expect(openChat).not.toHaveBeenCalled()
  })
})
