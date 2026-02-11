export type URLCitation = {
  title: string
  url: string
  start_index?: number
  end_index?: number
}

export type Annotation = {
  type: 'url_citation'
  url_citation: URLCitation
}

export type WebSearchSource = {
  title: string
  url: string
}

export type WebSearchState = {
  query?: string
  status: 'searching' | 'completed' | 'failed' | 'blocked'
  sources?: WebSearchSource[]
  reason?: string
}

export type Message = {
  role: 'user' | 'assistant'
  content: string
  documentContent?: string // Separate field for document content
  multimodalText?: string // Image descriptions from multimodal model
  documents?: Array<{ name: string }> // New field for document names and types
  imageData?: Array<{ base64: string; mimeType: string }> // Base64 image data for multimodal support - excluded from localStorage
  timestamp: Date
  thoughts?: string
  isThinking?: boolean
  thinkingDuration?: number // Duration in seconds
  isError?: boolean
  webSearch?: WebSearchState
  webSearchBeforeThinking?: boolean // True if web search started before thinking
  annotations?: Annotation[] // URL citations from web search
  searchReasoning?: string // Search agent's reasoning for multi-turn context
}

export type TitleState = 'placeholder' | 'generated' | 'manual'

export type Chat = {
  id: string
  title: string
  titleState?: TitleState
  messages: Message[]
  createdAt: Date
  // Sync metadata - optional for backward compatibility
  syncedAt?: number
  locallyModified?: boolean
  decryptionFailed?: boolean
  // Blank chat flag - true for new chats that haven't been used yet
  isBlankChat?: boolean
  // Local-only flag - true for chats that should never sync to cloud
  isLocalOnly?: boolean
  // Pending save flag - true while initial save is in progress
  pendingSave?: boolean
  // Project association - when set, chat belongs to a project
  projectId?: string
}

export type LoadingState = 'idle' | 'loading' | 'streaming' | 'retrying'

export type AIModel = string

export type ModelInfo = {
  name: string
  nameShort: string
  description: string
  image: string
  endpoint?: string
}

export type LabelType = 'verify' | 'model' | 'info' | 'reasoning' | null

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
