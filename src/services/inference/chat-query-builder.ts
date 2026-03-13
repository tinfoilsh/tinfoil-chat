import {
  getMessageDocuments,
  getMessageImages,
} from '@/components/chat/attachment-helpers'
import type { Message } from '@/components/chat/types'
import type { BaseModel } from '@/config/models'
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources/chat/completions'

/**
 * Helper for building chat completion queries with model-specific system prompt injection
 *
 * **System Prompt Handling by Model:**
 * - **Llama** (llama3-3-70b): Uses system role with header tokens
 * - **GPT-OSS** (gpt-oss-120b): Uses system role (Harmony format)
 * - **Qwen** (qwen2-5-72b): Uses system role (ChatML format)
 * - **Mistral** (mistral-small): Uses system role (ChatML format)
 * - **DeepSeek** (deepseek-r1): Prepends to first user message (no system role support)
 * - **Unknown models**: Prepends to first user message (safe default)
 */

const GENUI_TOOL_HINT = `You have render_* tools for creating visual components (charts, tables, stat cards, etc.). When the user asks for a chart, table, or visual data presentation, always use the appropriate render tool instead of markdown, mermaid, or code blocks. Use them whenever visual structure adds clarity.`

export interface ChatQueryBuilderParams {
  model: BaseModel
  systemPrompt: string
  rules?: string
  messages: Message[]
  maxMessages: number
}

export class ChatQueryBuilder {
  /**
   * Build chat completion messages with model-appropriate system prompt and rules injection
   */
  static buildMessages(
    params: ChatQueryBuilderParams,
  ): ChatCompletionMessageParam[] {
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

    const result: ChatCompletionMessageParam[] = []

    // Determine if we should use system role or prepend to user message
    const useSystemRole = this.shouldUseSystemRole(modelId)

    // Add system message/instructions based on model requirements
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
        } as ChatCompletionSystemMessageParam)
      }
    }

    // Add conversation history
    const recentMessages = conversationMessages.slice(-maxMessages)
    let addedSystemInstructions = useSystemRole

    for (let index = 0; index < recentMessages.length; index++) {
      const msg = recentMessages[index]

      if (msg.role === 'user') {
        let userContent = this.buildUserContent(msg, model.multimodal)

        // For models that don't use system role (e.g. DeepSeek): inject system instructions as a separate user message before the first user message
        if (!addedSystemInstructions) {
          const rawInstructions = processedRules
            ? `${processedSystemPrompt}\n\n${processedRules}`
            : processedSystemPrompt
          result.push({
            role: 'user',
            content: `<system>\n${rawInstructions}\n\n${GENUI_TOOL_HINT}\n</system>`,
          } as ChatCompletionUserMessageParam)
          addedSystemInstructions = true
        }

        result.push({
          role: 'user',
          content: userContent,
        } as ChatCompletionUserMessageParam)
      } else if (msg.content || msg.toolCalls) {
        // Assistant messages - include annotations, searchReasoning, and tool calls for multi-turn context
        const assistantParam: ChatCompletionAssistantMessageParam & {
          annotations?: Message['annotations']
          search_reasoning?: string
          tool_calls?: Array<{
            id: string
            type: 'function'
            function: { name: string; arguments: string }
          }>
        } = {
          role: 'assistant',
          content: msg.content || null,
        }
        if (msg.annotations && msg.annotations.length > 0) {
          assistantParam.annotations = msg.annotations
        }
        if (msg.searchReasoning) {
          assistantParam.search_reasoning = msg.searchReasoning
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          assistantParam.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          }))
        }
        result.push(assistantParam)

        // Add tool result messages for each tool call (display-only acknowledgment)
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            result.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: 'displayed',
            } as ChatCompletionMessageParam)
          }
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
   * Build system content based on model requirements
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
  ):
    | string
    | Array<{ type: string; text?: string; image_url?: { url: string } }> {
    let textContent = msg.content

    // Derive document content from attachments (or legacy fields via helpers)
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

    // Derive image data from attachments (or legacy fields via helpers)
    const imageAttachments = getMessageImages(msg)

    if (imageAttachments.length > 0 && multimodal) {
      const content: Array<{
        type: string
        text?: string
        image_url?: { url: string }
      }> = [{ type: 'text', text: textContent }]

      for (const img of imageAttachments) {
        if (img.base64 && img.mimeType) {
          content.push({
            type: 'image_url',
            image_url: {
              url: `data:${img.mimeType};base64,${img.base64}`,
            },
          })
        }
      }

      return content
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
