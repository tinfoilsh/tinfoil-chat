export type Message = {
  role: 'user' | 'assistant'
  content: string
  documentContent?: string  // Separate field for document content
  documents?: Array<{ name: string }> // New field for document names and types
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
}

export type LoadingState = 'idle' | 'loading' | 'streaming'

export type AIModel = string

export type ModelInfo = {
  name: string
  nameShort: string
  description: string
  image: string
  repo?: string
  enclave: string
  endpoint?: string
  digest?: string
}

export type LabelType = 'verify' | 'model' | 'info' | null

// Document processing types
export type DocumentProcessingStatus = 'idle' | 'uploading' | 'processing' | 'complete' | 'error'

export interface DocumentProcessingResult {
  document?: {
    md_content: string;
    filename?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface DocumentUploadProps {
  onUploadStart: () => void;
  onUploadComplete: (content: string) => void;
  onUploadError: (error: Error) => void;
  setIsUploading: (isUploading: boolean) => void;
}
