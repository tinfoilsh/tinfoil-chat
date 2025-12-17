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

        // For models that don't use system role: prepend system instructions to the FIRST user message only
        if (!addedSystemInstructions) {
          const instructions = processedRules
            ? `${processedSystemPrompt}\n\n${processedRules}`
            : processedSystemPrompt

          if (Array.isArray(userContent)) {
            // For multimodal content, prepend instructions to the text part
            const textPart = userContent.find((part) => part.type === 'text')
            if (textPart && textPart.text) {
              textPart.text = `${instructions}\n\n${textPart.text}`
            }
          } else {
            // String content
            userContent = `${instructions}\n\n${userContent}`
          }
          addedSystemInstructions = true
        }

        result.push({
          role: 'user',
          content: userContent,
        } as ChatCompletionUserMessageParam)
      } else if (msg.content) {
        // Assistant messages
        result.push({
          role: 'assistant',
          content: msg.content,
        } as ChatCompletionAssistantMessageParam)
      }
    }

    return result
  }

  /**
   * Determine if the model should use system role or prepend to user message
   */
  private static shouldUseSystemRole(modelId: string): boolean {
    return (
      modelId.startsWith('llama') ||
      modelId.startsWith('gpt-oss') ||
      modelId.startsWith('qwen') ||
      modelId.startsWith('mistral')
    )
  }

  /**
   * Build system content based on model requirements
   */
  private static buildSystemContent(
    modelId: string,
    systemPrompt: string,
    rules: string,
  ): string | null {
    const fullPrompt = rules ? `${systemPrompt}\n${rules}` : systemPrompt

    if (modelId.startsWith('deepseek')) {
      // DeepSeek R1 deliberately does not support explicit system prompts
      // According to Together.ai docs, the model performs worse if a separate system prompt is added
      // All instructions should be placed in the user message
      return null
    }

    if (modelId.startsWith('mistral')) {
      // Mistral models support system prompts using ChatML-like format
      // Compatible with OpenAI's message schema
      return fullPrompt
    }

    if (modelId.startsWith('llama')) {
      // Llama 3.3 uses Meta's structured chat template with header tokens
      // <|start_header_id|>system<|end_header_id|> format
      // APIs handle token insertion automatically when using standard message format
      return fullPrompt
    }

    if (modelId.startsWith('gpt-oss')) {
      // GPT-OSS models use the Harmony prompt format from OpenAI's open-weights family
      // System prompts go in the "system" message field following OpenAI Chat Completions schema
      return fullPrompt
    }

    if (modelId.startsWith('qwen')) {
      // Qwen models support system prompts using ChatML template format
      // Compatible with OpenAI's message schema
      return fullPrompt
    }

    // Default fallback: prepend to first user message (safer for unknown models)
    return null
  }

  /**
   * Build user content including document and image data if applicable
   */
  private static buildUserContent(
    msg: Message,
    multimodal?: boolean,
  ):
    | string
    | Array<{ type: string; text?: string; image_url?: { url: string } }> {
    // Build text content including documents
    let textContent = msg.content

    if (msg.documentContent) {
      textContent = `${msg.content}\n\n${msg.documentContent}`
    }

    // Handle multimodal content (images)
    if (msg.imageData && msg.imageData.length > 0 && multimodal) {
      const content: Array<{
        type: string
        text?: string
        image_url?: { url: string }
      }> = [{ type: 'text', text: textContent }]

      // Add image parts
      for (const imgData of msg.imageData) {
        content.push({
          type: 'image_url',
          image_url: {
            url: `data:${imgData.mimeType};base64,${imgData.base64}`,
          },
        })
      }

      return content
    }

    return textContent
  }
}
