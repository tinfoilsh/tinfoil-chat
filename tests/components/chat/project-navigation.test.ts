import { openProjectChat } from '@/components/chat/project-navigation'
import { getChatPath, getNewChatPath } from '@/utils/navigation'
import { describe, expect, it } from 'vitest'

describe('openProjectChat', () => {
  it('opens a new project without carrying over the active chat', async () => {
    let activeChatId: string | null = 'existing-chat'
    let path = getChatPath(activeChatId)

    await openProjectChat({
      projectId: 'new-project',
      createNewChat: (isLocalOnly, fromUserAction) => {
        expect(isLocalOnly).toBe(false)
        expect(fromUserAction).toBe(true)
        activeChatId = null
      },
      enterProjectMode: async (projectId) => {
        path = activeChatId
          ? getChatPath(activeChatId, { projectId })
          : getNewChatPath({ projectId })
        return true
      },
    })

    expect(activeChatId).toBeNull()
    expect(path).toBe('/project/new-project')
  })
})
