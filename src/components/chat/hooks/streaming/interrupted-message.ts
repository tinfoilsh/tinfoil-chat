import type { Message, TimelineBlock } from '../../types'

function finalizeTimelineBlock(block: TimelineBlock): TimelineBlock {
  switch (block.type) {
    case 'thinking':
      return block.isThinking ? { ...block, isThinking: false } : block
    case 'web_search':
      return block.state.status === 'searching'
        ? { ...block, state: { ...block.state, status: 'failed' } }
        : block
    case 'url_fetches':
      return {
        ...block,
        fetches: block.fetches.map((fetch) =>
          fetch.status === 'fetching' ? { ...fetch, status: 'failed' } : fetch,
        ),
      }
    case 'code_exec':
      return {
        ...block,
        calls: block.calls.map((call) =>
          call.status === 'running' ? { ...call, status: 'failed' } : call,
        ),
      }
    default:
      return block
  }
}

export function hasVisibleAssistantMessage(message: Message): boolean {
  return Boolean(
    message.content ||
    message.thoughts ||
    message.webSearch ||
    message.urlFetches?.length ||
    message.annotations?.length ||
    message.searchReasoning ||
    message.toolCalls?.length ||
    message.codeExecCalls?.length,
  )
}

export function finalizeInterruptedMessage(
  message: Message,
  turnId?: string,
): Message {
  return {
    ...message,
    turnId: turnId ?? message.turnId,
    isThinking: false,
    webSearch:
      message.webSearch?.status === 'searching'
        ? { ...message.webSearch, status: 'failed' }
        : message.webSearch,
    urlFetches: message.urlFetches?.map((fetch) =>
      fetch.status === 'fetching' ? { ...fetch, status: 'failed' } : fetch,
    ),
    codeExecCalls: message.codeExecCalls?.map((call) =>
      call.status === 'running' ? { ...call, status: 'failed' } : call,
    ),
    timeline: message.timeline?.map(finalizeTimelineBlock),
  }
}

export function mergeInterruptedAssistant(
  messages: Message[],
  turnId: string,
  assistantMessage: Message | null,
): Message[] {
  const assistantIndex = messages.findIndex(
    (message) => message.role === 'assistant' && message.turnId === turnId,
  )
  if (!assistantMessage) {
    return assistantIndex < 0
      ? messages
      : messages.filter((_, index) => index !== assistantIndex)
  }

  const finalizedMessage = finalizeInterruptedMessage(assistantMessage, turnId)
  if (assistantIndex >= 0) {
    const merged = [...messages]
    merged[assistantIndex] = finalizedMessage
    return merged
  }

  const userIndex = messages.findIndex(
    (message) => message.role === 'user' && message.turnId === turnId,
  )
  const insertAt = userIndex >= 0 ? userIndex + 1 : messages.length
  return [
    ...messages.slice(0, insertAt),
    finalizedMessage,
    ...messages.slice(insertAt),
  ]
}
