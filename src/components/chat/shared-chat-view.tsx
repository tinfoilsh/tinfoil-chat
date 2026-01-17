import { type BaseModel } from '@/config/models'
import type { ShareableChatData } from '@/utils/compression'
import 'katex/dist/katex.min.css'
import { memo, useState } from 'react'
import { getRendererRegistry } from './renderers/client'
import type { Message } from './types'

type SharedChatViewProps = {
  chatData: ShareableChatData
  isDarkMode: boolean
  model: BaseModel
}

const SharedChatMessage = memo(function SharedChatMessage({
  message,
  messageIndex,
  model,
  isDarkMode,
  expandedThoughtsState,
  setExpandedThoughtsState,
}: {
  message: Message
  messageIndex: number
  model: BaseModel
  isDarkMode: boolean
  expandedThoughtsState: Record<string, boolean>
  setExpandedThoughtsState: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >
}) {
  const renderer = getRendererRegistry().getMessageRenderer(message, model)
  const RendererComponent = renderer.render

  return (
    <RendererComponent
      message={message}
      messageIndex={messageIndex}
      model={model}
      isDarkMode={isDarkMode}
      isLastMessage={false}
      isStreaming={false}
      expandedThoughtsState={expandedThoughtsState}
      setExpandedThoughtsState={setExpandedThoughtsState}
      onEditMessage={undefined}
      onRegenerateMessage={undefined}
    />
  )
})

const getMessageKey = (message: Message, index: number): string => {
  const timestamp =
    message.timestamp instanceof Date
      ? message.timestamp.getTime()
      : message.timestamp
  return `shared-${message.role}-${timestamp}-${index}`
}

export function SharedChatView({
  chatData,
  isDarkMode,
  model,
}: SharedChatViewProps) {
  const [expandedThoughtsState, setExpandedThoughtsState] = useState<
    Record<string, boolean>
  >({})

  const messages: Message[] = chatData.messages.map((m) => ({
    role: m.role,
    content: m.content,
    documentContent: m.documentContent,
    documents: m.documents,
    timestamp: new Date(m.timestamp),
    thoughts: m.thoughts,
    thinkingDuration: m.thinkingDuration,
    isError: m.isError,
  }))

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl px-4 pb-6 pt-8">
      {messages.map((message, index) => (
        <SharedChatMessage
          key={getMessageKey(message, index)}
          message={message}
          messageIndex={index}
          model={model}
          isDarkMode={isDarkMode}
          expandedThoughtsState={expandedThoughtsState}
          setExpandedThoughtsState={setExpandedThoughtsState}
        />
      ))}
    </div>
  )
}
