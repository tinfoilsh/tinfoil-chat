import type { Annotation } from '@/components/chat/types'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

export interface AguiToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type AguiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'url'; value: string } }

export interface AguiMessage {
  id: string
  role: string
  content?: string | AguiContentPart[]
  toolCalls?: AguiToolCall[]
  toolCallId?: string
  // What an earlier assistant turn found and how it got there. The query
  // builder attaches these deliberately so a follow-up question about the
  // previous answer -- which source said that, why it concluded that -- still
  // has the previous answer's citations and reasoning to work from.
  annotations?: Annotation[]
  searchReasoning?: string
  reasoningContent?: string
}

export interface AguiRenderedTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/**
 * The pair that makes a run recoverable, both 128 random bits as hex. The
 * caller mints them: the harness derives the key its log is sealed under from
 * the secret, so opening the log is the whole of the authorization to read it.
 */
export interface RunStorage {
  sessionId: string
  recoveryToken: string
}

export interface RunAgentInput extends Partial<RunStorage> {
  threadId: string
  runId: string
  messages: AguiMessage[]
  tools?: AguiRenderedTool[]
  forwardedProps?: {
    model: string
    reasoningEffort?: string
    thinking?: boolean
    webSearch?: boolean
    piiCheck?: boolean
  }
  resume?: boolean
}

export function toAguiMessages(
  messages: ChatCompletionMessageParam[],
): AguiMessage[] {
  return messages.map((message, index) => {
    const source = message as ChatCompletionMessageParam & {
      tool_calls?: AguiToolCall[]
      tool_call_id?: string
      annotations?: Annotation[]
      search_reasoning?: string
      reasoning_content?: string
    }
    return {
      id: `m${index}`,
      role: message.role,
      content: toAguiContent(source.content),
      toolCalls: source.tool_calls,
      toolCallId: source.tool_call_id,
      annotations: source.annotations,
      searchReasoning: source.search_reasoning,
      reasoningContent: source.reasoning_content,
    }
  })
}

function toAguiContent(
  content: unknown,
): string | AguiContentPart[] | undefined {
  if (content == null) return undefined
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return undefined

  const parts: AguiContentPart[] = []
  for (const part of content) {
    if (part?.type === 'image_url' && part.image_url?.url) {
      parts.push({
        type: 'image',
        source: { type: 'url', value: part.image_url.url },
      })
    } else if (typeof part?.text === 'string') {
      parts.push({ type: 'text', text: part.text })
    }
  }
  return parts
}

export interface AguiUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export interface AguiActivity {
  toolCallId: string
  tool: string
  progress: number
  output: string[]
}

export interface AguiJsonPatch {
  op: 'add' | 'replace' | 'remove'
  path: string
  value?: unknown
}

export type AguiEvent =
  | {
      type: 'RUN_STARTED'
      threadId: string
      runId: string
      metadata?: { model?: string }
    }
  | { type: 'RUN_FINISHED'; metadata?: { usage?: AguiUsage } }
  | { type: 'RUN_ERROR'; message: string; code?: string }
  | { type: 'TEXT_MESSAGE_CHUNK'; messageId: string; delta: string }
  | { type: 'REASONING_MESSAGE_CHUNK'; messageId: string; delta: string }
  | {
      type: 'TOOL_CALL_START'
      toolCallId: string
      toolCallName: string
      parentMessageId?: string
    }
  | { type: 'TOOL_CALL_ARGS'; toolCallId: string; delta: string }
  | { type: 'TOOL_CALL_END'; toolCallId: string }
  | { type: 'TOOL_CALL_RESULT'; toolCallId: string; content: string }
  | {
      type: 'ACTIVITY_SNAPSHOT'
      messageId: string
      activityType: string
      content: AguiActivity
    }
  | { type: 'ACTIVITY_DELTA'; messageId: string; patch: AguiJsonPatch[] }

export interface AguiEventStream extends AsyncIterable<AguiEvent> {
  recoveryReady?: Promise<void>
  abandonRecovery?: () => Promise<void>
}

export const WEB_SEARCH_TOOL = 'web_search'
export const WEB_FETCH_TOOL = 'web_fetch'
