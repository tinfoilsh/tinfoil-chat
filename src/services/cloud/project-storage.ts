import type {
  CreateProjectData,
  Project,
  ProjectData,
  ProjectDocument,
  ProjectDocumentListResponse,
  ProjectDocumentSyncStatus,
  ProjectListResponse,
  ProjectSyncStatus,
  UpdateProjectData,
} from '@/types/project'
import { logError } from '@/utils/error-handling'
import { isTokenValid } from '@/utils/token-validation'
import { encryptionService } from '../encryption/encryption-service'

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.tinfoil.sh'

export class ProjectStorageService {
  private getToken: (() => Promise<string | null>) | null = null

  setTokenGetter(getToken: () => Promise<string | null>) {
    this.getToken = getToken
  }

  private async getHeaders(): Promise<HeadersInit> {
    if (!this.getToken) {
      throw new Error('Token getter not set')
    }

    const token = await this.getToken()
    if (!token) {
      throw new Error('Failed to get authentication token')
    }

    if (!isTokenValid(token)) {
      throw new Error('Token is expired')
    }

    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  }

  async isAuthenticated(): Promise<boolean> {
    if (!this.getToken) return false
    const token = await this.getToken()
    return isTokenValid(token)
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
      summary: '',
    }

    await encryptionService.initialize()
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

    return {
      id: projectId,
      ...projectData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncVersion: 1,
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
      summary: data.summary ?? existing.summary,
    }

    await encryptionService.initialize()
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

      const encrypted = await response.json()

      await encryptionService.initialize()
      const decrypted = (await encryptionService.decrypt(
        encrypted,
      )) as ProjectData

      return {
        id: projectId,
        name: decrypted.name,
        description: decrypted.description,
        systemInstructions: decrypted.systemInstructions,
        summary: decrypted.summary,
        createdAt: '', // These will be filled by list response
        updatedAt: '',
        syncVersion: 1,
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

    await encryptionService.initialize()
    const encrypted = await encryptionService.encrypt({ content })

    const response = await fetch(
      `${API_BASE_URL}/api/projects/${projectId}/documents`,
      {
        method: 'PUT',
        headers: await this.getHeaders(),
        body: JSON.stringify({
          documentId,
          filename,
          contentType,
          data: JSON.stringify(encrypted),
        }),
      },
    )

    if (!response.ok) {
      throw new Error(`Failed to upload document: ${response.statusText}`)
    }

    return {
      id: documentId,
      projectId,
      filename,
      contentType,
      sizeBytes: content.length,
      syncVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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

      const encrypted = await response.json()

      await encryptionService.initialize()
      const decrypted = (await encryptionService.decrypt(encrypted)) as {
        content: string
      }

      return {
        id: documentId,
        projectId,
        filename: '',
        contentType: '',
        sizeBytes: decrypted.content.length,
        syncVersion: 1,
        createdAt: '',
        updatedAt: '',
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
}

export const projectStorage = new ProjectStorageService()
