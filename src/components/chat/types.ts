export type Message = {
  role: 'user' | 'assistant'
  content: string
  documentContent?: string // Separate field for document content
  documents?: Array<{ name: string }> // New field for document names and types
  imageData?: Array<{ base64: string; mimeType: string }> // Base64 image data for multimodal support - excluded from localStorage
  timestamp: Date
  thoughts?: string
  isThinking?: boolean
  thinkingDuration?: number // Duration in seconds
  isError?: boolean
}

export type Chat = {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
  // Sync metadata - optional for backward compatibility
  syncedAt?: number
  locallyModified?: boolean
  decryptionFailed?: boolean
  // Temporary ID flag - true if chat has a temporary UUID awaiting server ID
  hasTemporaryId?: boolean
  // Blank chat flag - true for new chats that haven't been used yet
  isBlankChat?: boolean
  // Local-only flag - true for chats that should never sync to cloud
  isLocalOnly?: boolean
  // Intended local-only - set when creating in local tab (before first save)
  intendedLocalOnly?: boolean
}

export type LoadingState = 'idle' | 'loading' | 'streaming'

export type AIModel = string

export type ModelInfo = {
  name: string
  nameShort: string
  description: string
  image: string
  endpoint?: string
}

export type LabelType = 'verify' | 'model' | 'info' | null

// Document processing types
export type DocumentProcessingStatus =
  | 'idle'
  | 'uploading'
  | 'processing'
  | 'complete'
  | 'error'

export interface DocumentMetadata {
  filename?: string
  size?: number
  type?: string
  lastModified?: number
}

export interface DocumentProcessingResult {
  document?: {
    md_content: string
    filename?: string
  } & DocumentMetadata
  status?: DocumentProcessingStatus
  error?: string
}

export interface DocumentUploadProps {
  onUploadStart: () => void
  onUploadComplete: (content: string) => void
  onUploadError: (error: Error) => void
  setIsUploading: (isUploading: boolean) => void
}
