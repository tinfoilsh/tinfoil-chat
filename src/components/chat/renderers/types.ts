import type { LoadingState, Message } from '@/components/chat/types'
import type { BaseModel } from '@/config/models'

// ProcessedDocument type for chat input documents
export type ProcessedDocument = {
  id: string
  name: string
  time: Date
  content?: string
  isUploading?: boolean
  imageData?: { base64: string; mimeType: string }
}

export interface MessageRenderProps {
  message: Message
  model: BaseModel
  isDarkMode: boolean
  isLastMessage?: boolean
  isStreaming?: boolean
  expandedThoughtsState?: Record<string, boolean>
  setExpandedThoughtsState?: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >
  titleModelName?: string
}

export interface InputRenderProps {
  onSubmit: (
    content: Message['content'],
    documentContent?: Message['documentContent'],
    documents?: Message['documents'],
    imageData?: Message['imageData'],
  ) => void
  isDarkMode: boolean
  isPremium: boolean
  model: BaseModel
  input: string
  setInput: (value: string) => void
  loadingState: LoadingState
  cancelGeneration: () => void
  inputRef: React.RefObject<HTMLTextAreaElement>
  handleInputFocus: () => void
  handleDocumentUpload?: (file: File) => Promise<void>
  processedDocuments?: ProcessedDocument[]
  removeDocument?: (id: string) => void
  hasMessages?: boolean
}

export interface MessageRenderer {
  id: string
  canRender: (message: Message, model: BaseModel) => boolean
  render: (props: MessageRenderProps) => JSX.Element
}

export interface InputRenderer {
  id: string
  canRender: (model: BaseModel) => boolean
  render: (props: InputRenderProps) => JSX.Element
}

export interface UIProvider {
  id: string
  modelPattern: RegExp
  messageRenderer: MessageRenderer
  inputRenderer: InputRenderer
  features?: {
    thoughts?: boolean
    documents?: boolean
    streaming?: boolean
    multimodal?: boolean
  }
}
