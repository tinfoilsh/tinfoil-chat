/**
 * Project types for the Projects feature
 * Projects are containers with custom system instructions, documents, and project-specific chats
 */

export interface Project {
  id: string
  name: string
  description: string
  systemInstructions: string
  summary: string
  createdAt: string
  updatedAt: string
  syncVersion: number
}

export interface ProjectDocument {
  id: string
  projectId: string
  filename: string
  contentType: string
  sizeBytes: number
  syncVersion: number
  createdAt: string
  updatedAt: string
  content?: string
}

export interface ProjectChat {
  id: string
  projectId: string
  title: string
  messageCount: number
  createdAt: string
  updatedAt: string
}

export interface ProjectData {
  name: string
  description: string
  systemInstructions: string
  summary: string
}

export interface CreateProjectData {
  name: string
  description?: string
  systemInstructions?: string
}

export interface UpdateProjectData {
  name?: string
  description?: string
  systemInstructions?: string
  summary?: string
}

export interface ProjectListResponse {
  projects: Array<{
    id: string
    key: string
    createdAt: string
    updatedAt: string
    syncVersion: number
    size: number
    content?: string
  }>
  nextContinuationToken?: string
  hasMore: boolean
}

export interface ProjectSyncStatus {
  count: number
  lastUpdated: string | null
}

export interface ProjectDocumentListResponse {
  documents: Array<{
    id: string
    projectId: string
    filename: string
    contentType: string
    sizeBytes: number
    syncVersion: number
    createdAt: string
    updatedAt: string
    content?: string
  }>
}

export interface ProjectDocumentSyncStatus {
  count: number
  lastUpdated: string | null
}

export interface ProjectContextUsage {
  systemInstructions: number
  documents: Array<{
    filename: string
    tokens: number
  }>
  summary: number
  totalUsed: number
  modelLimit: number
  availableForChat: number
}
