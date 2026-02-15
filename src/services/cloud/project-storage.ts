import type {
  CreateProjectData,
  Project,
  ProjectChatListResponse,
  ProjectChatSyncStatus,
  ProjectData,
  ProjectDocument,
  ProjectDocumentListResponse,
  ProjectDocumentSyncStatus,
  ProjectListResponse,
  ProjectSyncStatus,
  UpdateProjectData,
} from '@/types/project'
import { logError } from '@/utils/error-handling'
import { authTokenManager } from '../auth'
import { encryptionService } from '../encryption/encryption-service'

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.tinfoil.sh'

export class ProjectStorageService {
  private async getHeaders(): Promise<Record<string, string>> {
    return authTokenManager.getAuthHeaders()
  }

  async isAuthenticated(): Promise<boolean> {
    return authTokenManager.isAuthenticated()
  }

  async generateProjectId(): Promise<{
    projectId: string
    timestamp: string
    reverseTimestamp: number
  }> {
    const response = await fetch(`${API_BASE_URL}/api/projects/generate-id`, {
      method: 'POST',
      headers: await this.getHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Failed to generate project ID: ${response.statusText}`)
    }

    return response.json()
  }

  async createProject(data: CreateProjectData): Promise<Project> {
    const { projectId } = await this.generateProjectId()

    const projectData: ProjectData = {
      name: data.name,
      description: data.description || '',
      systemInstructions: data.systemInstructions || '',
      memory: [],
    }

    const encrypted = await encryptionService.encrypt(projectData)

    const response = await fetch(`${API_BASE_URL}/api/storage/project`, {
      method: 'PUT',
      headers: await this.getHeaders(),
      body: JSON.stringify({
        projectId,
        data: JSON.stringify(encrypted),
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to create project: ${response.statusText}`)
    }

    const responseData = await response.json()

    return {
      id: projectId,
      ...projectData,
      createdAt: responseData.createdAt,
      updatedAt: responseData.updatedAt,
      syncVersion: responseData.syncVersion,
    }
  }

  async updateProject(
    projectId: string,
    data: UpdateProjectData,
  ): Promise<void> {
    const existing = await this.getProject(projectId)
    if (!existing) {
      throw new Error('Project not found')
    }

    const projectData: ProjectData = {
      name: data.name ?? existing.name,
      description: data.description ?? existing.description,
      systemInstructions:
        data.systemInstructions ?? existing.systemInstructions,
      memory: data.memory ?? existing.memory,
    }

    const encrypted = await encryptionService.encrypt(projectData)

    const response = await fetch(`${API_BASE_URL}/api/storage/project`, {
      method: 'PUT',
      headers: await this.getHeaders(),
      body: JSON.stringify({
        projectId,
        data: JSON.stringify(encrypted),
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to update project: ${response.statusText}`)
    }
  }

  async getProject(projectId: string): Promise<Project | null> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/storage/project/${projectId}`,
        {
          headers: await this.getHeaders(),
        },
      )

      if (response.status === 404) {
        return null
      }

      if (!response.ok) {
        throw new Error(`Failed to get project: ${response.statusText}`)
      }

      const data = await response.json()

      const decrypted = (await encryptionService.decrypt(
        data.content,
      )) as ProjectData

      return {
        id: projectId,
        name: decrypted.name,
        description: decrypted.description,
        systemInstructions: decrypted.systemInstructions,
        memory: decrypted.memory || [],
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        syncVersion: data.syncVersion,
      }
    } catch (error) {
      logError(`Failed to get project ${projectId}`, error, {
        component: 'ProjectStorage',
        action: 'getProject',
        metadata: { projectId },
      })
      return null
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    const response = await fetch(
      `${API_BASE_URL}/api/storage/project/${projectId}`,
      {
        method: 'DELETE',
        headers: await this.getHeaders(),
      },
    )

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete project: ${response.statusText}`)
    }
  }

  async listProjects(options?: {
    limit?: number
    continuationToken?: string
    includeContent?: boolean
  }): Promise<ProjectListResponse> {
    const params = new URLSearchParams()
    if (options?.limit) {
      params.append('limit', options.limit.toString())
    }
    if (options?.continuationToken) {
      params.append('continuationToken', options.continuationToken)
    }
    if (options?.includeContent) {
      params.append('includeContent', 'true')
    }

    const url = `${API_BASE_URL}/api/projects${params.toString() ? `?${params.toString()}` : ''}`
    const response = await fetch(url, {
      headers: await this.getHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Failed to list projects: ${response.statusText}`)
    }

    return response.json()
  }

  async getProjectSyncStatus(): Promise<ProjectSyncStatus> {
    const response = await fetch(`${API_BASE_URL}/api/projects/sync-status`, {
      headers: await this.getHeaders(),
    })

    if (!response.ok) {
      throw new Error(
        `Failed to get project sync status: ${response.statusText}`,
      )
    }

    return response.json()
  }

  async getProjectsUpdatedSince(options: {
    since: string
  }): Promise<ProjectListResponse> {
    const params = new URLSearchParams()
    params.append('since', options.since)

    const url = `${API_BASE_URL}/api/projects/updated-since?${params.toString()}`
    const response = await fetch(url, {
      headers: await this.getHeaders(),
    })

    if (!response.ok) {
      throw new Error(
        `Failed to get projects updated since: ${response.statusText}`,
      )
    }

    return response.json()
  }

  async generateDocumentId(projectId: string): Promise<{
    documentId: string
    timestamp: string
    reverseTimestamp: number
  }> {
    const response = await fetch(
      `${API_BASE_URL}/api/projects/${projectId}/documents/generate-id`,
      {
        method: 'POST',
        headers: await this.getHeaders(),
      },
    )

    if (!response.ok) {
      throw new Error(`Failed to generate document ID: ${response.statusText}`)
    }

    return response.json()
  }

  async uploadDocument(
    projectId: string,
    filename: string,
    contentType: string,
    content: string,
  ): Promise<ProjectDocument> {
    const { documentId } = await this.generateDocumentId(projectId)

    const encrypted = await encryptionService.encrypt({
      content,
      filename,
      contentType,
    })

    const response = await fetch(
      `${API_BASE_URL}/api/projects/${projectId}/documents`,
      {
        method: 'PUT',
        headers: await this.getHeaders(),
        body: JSON.stringify({
          documentId,
          data: JSON.stringify(encrypted),
        }),
      },
    )

    if (!response.ok) {
      throw new Error(`Failed to upload document: ${response.statusText}`)
    }

    const data = await response.json()

    return {
      id: documentId,
      projectId,
      filename,
      contentType,
      sizeBytes: new TextEncoder().encode(content).length,
      syncVersion: data.syncVersion,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      content,
    }
  }

  async getDocument(
    projectId: string,
    documentId: string,
  ): Promise<ProjectDocument | null> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${projectId}/documents/${documentId}`,
        {
          headers: await this.getHeaders(),
        },
      )

      if (response.status === 404) {
        return null
      }

      if (!response.ok) {
        throw new Error(`Failed to get document: ${response.statusText}`)
      }

      const data = await response.json()

      const decrypted = (await encryptionService.decrypt(data.content)) as {
        content: string
        filename?: string
        contentType?: string
      }

      return {
        id: documentId,
        projectId,
        filename: decrypted.filename || '',
        contentType: decrypted.contentType || '',
        sizeBytes: new TextEncoder().encode(decrypted.content).length,
        syncVersion: data.syncVersion,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        content: decrypted.content,
      }
    } catch (error) {
      logError(`Failed to get document ${documentId}`, error, {
        component: 'ProjectStorage',
        action: 'getDocument',
        metadata: { projectId, documentId },
      })
      return null
    }
  }

  async deleteDocument(projectId: string, documentId: string): Promise<void> {
    const response = await fetch(
      `${API_BASE_URL}/api/projects/${projectId}/documents/${documentId}`,
      {
        method: 'DELETE',
        headers: await this.getHeaders(),
      },
    )

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete document: ${response.statusText}`)
    }
  }

  async listDocuments(
    projectId: string,
    options?: { includeContent?: boolean },
  ): Promise<ProjectDocumentListResponse> {
    const params = new URLSearchParams()
    if (options?.includeContent) {
      params.append('includeContent', 'true')
    }

    const url = `${API_BASE_URL}/api/projects/${projectId}/documents${params.toString() ? `?${params.toString()}` : ''}`
    const response = await fetch(url, {
      headers: await this.getHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Failed to list documents: ${response.statusText}`)
    }

    return response.json()
  }

  async getDocumentSyncStatus(
    projectId: string,
  ): Promise<ProjectDocumentSyncStatus> {
    const response = await fetch(
      `${API_BASE_URL}/api/projects/${projectId}/documents/sync-status`,
      {
        headers: await this.getHeaders(),
      },
    )

    if (!response.ok) {
      throw new Error(
        `Failed to get document sync status: ${response.statusText}`,
      )
    }

    return response.json()
  }

  async listProjectChats(
    projectId: string,
    options?: { includeContent?: boolean },
  ): Promise<ProjectChatListResponse> {
    const params = new URLSearchParams()
    if (options?.includeContent) {
      params.append('includeContent', 'true')
    }

    const url = `${API_BASE_URL}/api/projects/${projectId}/chats${params.toString() ? `?${params.toString()}` : ''}`
    const response = await fetch(url, {
      headers: await this.getHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Failed to list project chats: ${response.statusText}`)
    }

    return response.json()
  }

  async getProjectChatsSyncStatus(
    projectId: string,
  ): Promise<ProjectChatSyncStatus> {
    const url = `${API_BASE_URL}/api/projects/${projectId}/chats/sync-status?_t=${Date.now()}`
    const response = await fetch(url, {
      headers: await this.getHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(
        `Failed to get project chats sync status: ${response.statusText}`,
      )
    }

    return response.json()
  }

  async getProjectChatsUpdatedSince(
    projectId: string,
    options: { since: string; cursorId?: string },
  ): Promise<ProjectChatListResponse> {
    const params = new URLSearchParams()
    params.append('since', options.since)
    if (options.cursorId) {
      params.append('cursor_id', options.cursorId)
    }
    params.append('_t', Date.now().toString())

    const url = `${API_BASE_URL}/api/projects/${projectId}/chats/updated-since?${params.toString()}`
    const response = await fetch(url, {
      headers: await this.getHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(
        `Failed to get project chats updated since: ${response.statusText}`,
      )
    }

    return response.json()
  }
}

export const projectStorage = new ProjectStorageService()
