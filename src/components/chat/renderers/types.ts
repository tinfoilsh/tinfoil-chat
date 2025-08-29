import type { BaseModel } from '@/app/config/models'
import type { Message } from '@/components/chat/types'

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
  loadingState: 'idle' | 'loading' | 'streaming'
  cancelGeneration: () => void
  inputRef: React.RefObject<HTMLTextAreaElement>
  handleInputFocus: () => void
  handleDocumentUpload?: (file: File) => Promise<void>
  processedDocuments?: any[]
  removeDocument?: (id: string) => void
  hasMessages?: boolean
}

export interface MessageRenderer {
  id: string
  modelPattern: RegExp
  canRender: (message: Message, model: BaseModel) => boolean
  render: (props: MessageRenderProps) => JSX.Element
}

export interface InputRenderer {
  id: string
  modelPattern: RegExp
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
    multiModal?: boolean
  }
}
