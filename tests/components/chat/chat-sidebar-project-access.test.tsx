import { ChatSidebar } from '@/components/chat/chat-sidebar'
import type { Chat } from '@/components/chat/types'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: {
    isLoaded: true,
    isSignedIn: true,
  },
  useProjects: vi.fn(),
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => mocks.auth,
  useUser: () => ({ user: { id: 'project-user' } }),
}))

vi.mock('@/hooks/use-projects', () => ({
  useProjects: mocks.useProjects,
}))

vi.mock('@/hooks/use-sync-health', () => ({
  useSyncHealth: () => ({ gate: { kind: 'ok' }, failedChats: {} }),
  useSyncHealthAttention: () => false,
  useSyncFailedChats: () => ({}),
}))

vi.mock('@/hooks/use-upgrade-to-pro', () => ({
  useUpgradeToPro: () => ({
    startUpgrade: vi.fn(),
    upgradeLoading: false,
    upgradeError: null,
  }),
}))

vi.mock('@/utils/cloud-sync-settings', () => ({
  CLOUD_SYNC_SETTING_CHANGED_EVENT: 'cloudSyncSettingChanged',
  hasUserSetLocalOnlyPreference: () => true,
  isCloudSyncEnabled: () => true,
  isLocalOnlyModeEnabled: () => false,
  setCloudSyncEnabled: vi.fn(),
  setLocalOnlyModeEnabled: vi.fn(),
}))

vi.mock('@/components/project/project-context', () => ({
  useProject: () => ({ deleteProject: vi.fn(), activeProject: null }),
}))

vi.mock('@/hooks/use-cloud-pagination', () => ({
  useCloudPagination: () => ({
    hasMore: false,
    isLoading: false,
    hasAttempted: false,
    isInitialized: true,
    loadMore: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-chat-search', () => ({
  useChatSearch: () => ({
    available: false,
    results: [],
    isSearching: false,
  }),
}))

vi.mock('@/components/chat/drag-context', () => ({
  useDrag: () => ({
    draggingChatId: null,
    draggingChatFromProjectId: null,
    draggingChatSource: null,
    dropTargetProjectId: null,
    dropTargetTab: null,
    isDropTargetChatHistory: false,
    setDraggingChat: vi.fn(),
    setDropTargetProject: vi.fn(),
    setDropTargetTab: vi.fn(),
    setDropTargetChatHistory: vi.fn(),
    clearDragState: vi.fn(),
  }),
}))

vi.mock('@/components/chat/use-favorite-drop-target', () => ({
  useFavoriteDropTarget: () => ({
    isFavoriteDropTarget: false,
    favoriteDropTargetProps: {},
  }),
}))

const currentChat = {
  id: 'blank-chat',
  title: 'New chat',
  messages: [],
  createdAt: new Date('2026-08-24T00:00:00.000Z'),
  isBlankChat: true,
} satisfies Chat

function renderSidebar(isPremium: boolean) {
  return render(
    <ChatSidebar
      isOpen={false}
      setIsOpen={vi.fn()}
      chats={[currentChat]}
      currentChat={currentChat}
      isDarkMode={false}
      pixelateSidebarChatTitles={false}
      createNewChat={vi.fn()}
      handleChatSelect={vi.fn()}
      updateChatTitle={vi.fn()}
      deleteChat={vi.fn()}
      isClient={true}
      isPremium={isPremium}
      onMoveChatToProject={vi.fn()}
      windowWidth={1280}
    />,
  )
}

describe('ChatSidebar project access', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mocks.auth.isSignedIn = true
    mocks.useProjects.mockReset().mockReturnValue({
      projects: [],
      loading: false,
      refresh: vi.fn(),
    })
  })

  it('makes cloud projects available to signed-in free accounts', () => {
    renderSidebar(false)

    expect(
      screen.getAllByRole('button', { name: 'Projects' }),
    ).not.toHaveLength(0)
    expect(mocks.useProjects).toHaveBeenCalledWith({ autoLoad: true })
  })

  it('keeps projects unavailable to signed-out visitors', () => {
    mocks.auth.isSignedIn = false
    renderSidebar(false)

    expect(screen.queryAllByRole('button', { name: 'Projects' })).toHaveLength(
      0,
    )
    expect(mocks.useProjects).toHaveBeenCalledWith({ autoLoad: false })
  })
})
