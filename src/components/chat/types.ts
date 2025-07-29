export type Message = {
  role: 'user' | 'assistant'
  content: string
  documentContent?: string // Separate field for document content
  documents?: Array<{ name: string }> // New field for document names and types
  imageData?: Array<{ base64: string; mimeType: string }> // Base64 image data for multimodal support - excluded from localStorage
  timestamp: Date
  thoughts?: string
  isThinking?: boolean
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

export type VerificationStatus = 'error' | 'pending' | 'loading' | 'success'

export interface MeasurementData {
  measurement?: string
  certificate?: string
}

export type VerificationState = {
  code: {
    status: VerificationStatus
    measurements?: MeasurementData
    error?: string
  }
  runtime: {
    status: VerificationStatus
    measurements?: string
    error?: string
  }
  security: {
    status: VerificationStatus
    error?: string
  }
}

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
