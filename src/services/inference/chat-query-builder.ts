/**
 * Helper for building Vercel AI SDK `ModelMessage[]` payloads with
 * model-specific system prompt injection.
 *
 * **System Prompt Handling by Model:**
 * - **Llama** (llama3-3-70b): Uses system role with header tokens
 * - **GPT-OSS** (gpt-oss-120b): Uses system role (Harmony format)
 * - **Qwen** (qwen2-5-72b): Uses system role (ChatML format)
 * - **Mistral** (mistral-small): Uses system role (ChatML format)
 * - **DeepSeek** (deepseek-r1): Prepends to first user message (no system role support)
 * - **Unknown models**: Prepends to first user message (safe default)
 */
import {
  getMessageDocuments,
  getMessageImages,
} from '@/components/chat/attachment-helpers'
import type { Message } from '@/components/chat/types'
import type { BaseModel } from '@/config/models'
import type {
  AssistantModelMessage,
  ModelMessage,
  SystemModelMessage,
  ToolModelMessage,
  UserContent,
  UserModelMessage,
} from '@ai-sdk/provider-utils'

const GENUI_TOOL_HINT = `You have render_* tools for rich visual components: charts (bar, line, pie, area), tables (data, comparison), source cards and link previews for web results, timelines, stat cards, progress bars, callouts (info/warning/tip/success/error), key-value lists, info cards, steps/checklists, and image grids. When content benefits from visual structure — comparisons, trends, proportions, chronologies, curated sources, highlighted takeaways, structured facts — always call the appropriate render tool instead of markdown, mermaid, or code blocks. After using web search, prefer render_source_cards or render_link_preview to surface the best sources. You may call multiple render tools in one response.`

export interface ChatQueryBuilderParams {
  model: BaseModel
  systemPrompt: string
  rules?: string
  messages: Message[]
  maxMessages: number
}

export class ChatQueryBuilder {
  /**
   * Build model messages with model-appropriate system prompt and rules injection.
   */
  static buildMessages(params: ChatQueryBuilderParams): ModelMessage[] {
    const {
      model,
      systemPrompt,
      rules,
      messages: conversationMessages,
      maxMessages,
    } = params
    const modelId = model.modelName

    const processedSystemPrompt = systemPrompt.replaceAll(
      '{MODEL_NAME}',
      model.name,
    )
    const processedRules = rules
      ? rules.replaceAll('{MODEL_NAME}', model.name)
      : ''

    const result: ModelMessage[] = []

    const useSystemRole = this.shouldUseSystemRole(modelId)

    if (useSystemRole) {
      const systemContent = this.buildSystemContent(
        modelId,
        processedSystemPrompt,
        processedRules,
      )
      if (systemContent) {
        result.push({
          role: 'system',
          content: systemContent,
        } as SystemModelMessage)
      }
    }

    const recentMessages = conversationMessages.slice(-maxMessages)
    let addedSystemInstructions = useSystemRole

    for (let index = 0; index < recentMessages.length; index++) {
      const msg = recentMessages[index]

      if (msg.role === 'user') {
        const userContent = this.buildUserContent(msg, model.multimodal)

        // For models that don't use system role (e.g. DeepSeek): inject system
        // instructions as a separate user message before the first user message.
        if (!addedSystemInstructions) {
          const rawInstructions = processedRules
            ? `${processedSystemPrompt}\n\n${processedRules}`
            : processedSystemPrompt
          result.push({
            role: 'user',
            content: `<system>\n${rawInstructions}\n\n${GENUI_TOOL_HINT}\n</system>`,
          } as UserModelMessage)
          addedSystemInstructions = true
        }

        result.push({
          role: 'user',
          content: userContent,
        } as UserModelMessage)
      } else if (msg.content || msg.toolCalls) {
        // Assistant turn — include text content and tool calls
        const assistantContent: AssistantModelMessage['content'] = []
        if (msg.content) {
          assistantContent.push({ type: 'text', text: msg.content })
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            let input: unknown = tc.arguments
            try {
              input = JSON.parse(tc.arguments)
            } catch {
              // Leave raw string if the model ever returned malformed JSON
            }
            assistantContent.push({
              type: 'tool-call',
              toolCallId: tc.id,
              toolName: tc.name,
              input,
            })
          }
        }
        result.push({
          role: 'assistant',
          content:
            assistantContent.length === 0
              ? [{ type: 'text', text: '' }]
              : assistantContent,
        } as AssistantModelMessage)

        // Emit synthetic tool results for each tool call so the conversation
        // history stays consistent on the next turn.
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          const toolResults: ToolModelMessage = {
            role: 'tool',
            content: msg.toolCalls.map((tc) => ({
              type: 'tool-result',
              toolCallId: tc.id,
              toolName: tc.name,
              output: { type: 'text', value: 'displayed' },
            })),
          }
          result.push(toolResults)
        }
      }
    }

    return result
  }

  /**
   * Determine if the model should use system role or prepend to user message.
   * Most models support system role; DeepSeek is the known exception.
   */
  private static shouldUseSystemRole(modelId: string): boolean {
    return !modelId.startsWith('deepseek')
  }

  /**
   * Build system content based on model requirements.
   */
  private static buildSystemContent(
    _modelId: string,
    systemPrompt: string,
    rules: string,
  ): string | null {
    const base = rules ? `${systemPrompt}\n${rules}` : systemPrompt
    return `${base}\n\n${GENUI_TOOL_HINT}`
  }

  /**
   * Build user content including document and image data if applicable.
   * Handles both new attachment format and legacy fields.
   */
  private static buildUserContent(
    msg: Message,
    multimodal?: boolean,
  ): UserContent {
    let textContent = msg.content

    // Prepend the quoted reference so the model knows what the user is replying to.
    if (msg.quote) {
      const quoted = msg.quote
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
      textContent = textContent
        ? `In reply to:\n${quoted}\n\n${textContent}`
        : `In reply to:\n${quoted}`
    }

    const docAttachments = getMessageDocuments(msg)
    if (docAttachments.length > 0) {
      const docContent = docAttachments
        .filter((a) => a.textContent)
        .map(
          (a) =>
            `Document title: ${a.fileName}\nDocument contents:\n${a.textContent}`,
        )
        .join('\n\n')
      if (docContent) {
        textContent = `---\nDocument content:\n${docContent}\n---\n\n${textContent}`
      }
    }

    const imageAttachments = getMessageImages(msg)

    if (imageAttachments.length > 0 && multimodal) {
      const parts: UserContent = [{ type: 'text', text: textContent }]
      for (const img of imageAttachments) {
        if (img.base64 && img.mimeType) {
          parts.push({
            type: 'image',
            image: `data:${img.mimeType};base64,${img.base64}`,
            mediaType: img.mimeType,
          })
        }
      }
      return parts
    }

    // Non-multimodal fallback: append image descriptions as text
    if (imageAttachments.length > 0 && !multimodal) {
      const descriptions = imageAttachments
        .filter((a) => a.description)
        .map((a) => `Image: ${a.fileName}\nDescription:\n${a.description}`)
        .join('\n\n')
      if (descriptions) {
        textContent = `${textContent}\n\n[Treat these descriptions as if they are the raw images.]\n${descriptions}`
      }
    }

    return textContent
  }
}
