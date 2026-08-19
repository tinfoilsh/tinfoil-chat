import {
  createNativeBackup,
  validateNativeBackup,
} from '@/services/backup/native-backup'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  listChats: vi.fn(),
  downloadChats: vi.fn(),
  listProjects: vi.fn(),
  getProjects: vi.fn(),
  listDocuments: vi.fn(),
  getDocuments: vi.fn(),
  getAllChats: vi.fn(),
}))

vi.mock('@/services/cloud/cek-encoding', () => ({
  hasPrimaryKey: () => true,
}))
vi.mock('@/services/cloud/cloud-storage', () => ({
  cloudStorage: {
    isAuthenticated: mocks.isAuthenticated,
    listChats: mocks.listChats,
    downloadChats: mocks.downloadChats,
  },
}))
vi.mock('@/services/cloud/project-storage', () => ({
  projectStorage: {
    listProjects: mocks.listProjects,
    getProjects: mocks.getProjects,
    listDocuments: mocks.listDocuments,
    getDocuments: mocks.getDocuments,
  },
}))
vi.mock('@/services/storage/chat-storage', () => ({
  chatStorage: { getAllChats: mocks.getAllChats },
}))
vi.mock('@/services/sync-enclave/sync-api', () => ({
  attachmentGet: vi.fn(),
}))

const timestamp = '2026-08-18T12:00:00.000Z'
const cloudContent = (id: string) =>
  JSON.stringify({
    id,
    title: id,
    createdAt: timestamp,
    messages: [{ role: 'user', content: 'hello', timestamp }],
  })

describe('native backup collection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isAuthenticated.mockResolvedValue(true)
    mocks.listProjects
      .mockResolvedValueOnce({
        projects: [
          {
            id: 'project-1',
            createdAt: timestamp,
            updatedAt: timestamp,
            syncVersion: 1,
          },
        ],
        nextContinuationToken: 'projects-2',
      })
      .mockResolvedValueOnce({ projects: [] })
    mocks.getProjects.mockResolvedValue(
      new Map([
        [
          'project-1',
          {
            id: 'project-1',
            name: 'Project',
            description: '',
            systemInstructions: '',
            memory: [],
            syncVersion: 1,
          },
        ],
      ]),
    )
    mocks.listDocuments.mockResolvedValue({ documents: [] })
    mocks.getDocuments.mockResolvedValue(new Map())
    mocks.listChats
      .mockResolvedValueOnce({
        conversations: [
          { id: 'changed', syncVersion: 1, updatedAt: timestamp },
        ],
        nextContinuationToken: 'chats-2',
      })
      .mockResolvedValueOnce({
        conversations: [{ id: 'stable', syncVersion: 1, updatedAt: timestamp }],
      })
      .mockResolvedValueOnce({
        conversations: [
          { id: 'changed', syncVersion: 1, updatedAt: timestamp },
        ],
        nextContinuationToken: 'chats-2',
      })
      .mockResolvedValueOnce({
        conversations: [{ id: 'stable', syncVersion: 1, updatedAt: timestamp }],
      })
    mocks.downloadChats
      .mockResolvedValueOnce([
        { id: 'changed', syncVersion: 2, content: cloudContent('changed') },
        { id: 'stable', syncVersion: 1, content: cloudContent('stable') },
      ])
      .mockResolvedValueOnce([
        { id: 'changed', syncVersion: 2, content: cloudContent('changed') },
      ])
    const local = {
      id: 'local',
      title: 'Local',
      createdAt: new Date(timestamp),
      updatedAt: timestamp,
      isLocalOnly: true,
      messages: [
        { role: 'user', content: 'local', timestamp: new Date(timestamp) },
      ],
    }
    mocks.getAllChats
      .mockResolvedValueOnce([local])
      .mockResolvedValueOnce([
        { ...local, updatedAt: '2026-08-18T12:00:01.000Z' },
      ])
  })

  it('freshly paginates scopes, retries changed rows, and marks instability', async () => {
    const archive = await createNativeBackup()
    const validated = validateNativeBackup(archive.data)

    expect(mocks.listProjects).toHaveBeenCalledTimes(2)
    expect(mocks.listChats).toHaveBeenCalledTimes(4)
    expect(mocks.downloadChats).toHaveBeenCalledTimes(2)
    expect(validated.manifest.complete).toBe(false)
    expect(validated.manifest.counts).toMatchObject({
      projects: 1,
      cloud_chats: 1,
      local_chats: 1,
    })
    expect(validated.manifest.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        'cloud_chat_unreadable_or_changed',
        'local_chats_changed',
      ]),
    )
  })
})
