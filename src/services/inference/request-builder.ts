import type { BaseModel } from '@/app/config/models'
import { CONSTANTS } from '@/components/chat/constants'
import type { Message } from '@/components/chat/types'

/**
 * Builds a streaming chat completion request for the selected model.
 * Composes system prompt + rules and serializes messages (including multimodal).
 * Notes:
 * - Dev simulator routes to /api/dev/simulator and bypasses Authorization.
 */
export interface BuildChatRequestParams {
  model: BaseModel
  systemPrompt: string
  rules?: string
  updatedMessages: Message[]
  maxMessages: number
  getApiKey: () => Promise<string>
  signal: AbortSignal
}

export interface BuiltChatRequest {
  proxyUrl: string
  requestInit: RequestInit
}

export async function buildChatRequest({
  model,
  systemPrompt,
  rules,
  updatedMessages,
  maxMessages,
  getApiKey,
  signal,
}: BuildChatRequestParams): Promise<BuiltChatRequest> {
  const proxyUrl =
    model.modelName === 'dev-simulator'
      ? '/api/dev/simulator'
      : `${CONSTANTS.INFERENCE_PROXY_URL}${model.endpoint}`

  let finalSystemPrompt = systemPrompt.replaceAll('{MODEL_NAME}', model.name)
  if (rules) {
    const processedRules = rules.replaceAll('{MODEL_NAME}', model.name)
    finalSystemPrompt += '\n' + processedRules
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  if (model.modelName !== 'dev-simulator') {
    headers.Authorization = `Bearer ${await getApiKey()}`
  }

  const messages = [
    {
      role: 'system',
      content: finalSystemPrompt,
    },
    ...updatedMessages.slice(-maxMessages).map((msg) => {
      if (msg.imageData && msg.imageData.length > 0 && model.multimodal) {
        const content = [
          {
            type: 'text',
            text: msg.documentContent
              ? `${msg.content}\n\n${
                  msg.documents
                    ?.map(
                      (doc) =>
                        `Document title: ${doc.name}\nDocument contents:\n${msg.documentContent}`,
                    )
                    .join('\n\n') ||
                  `Document contents:\n${msg.documentContent}`
                }`
              : msg.content,
          },
          ...msg.imageData.map((imgData) => ({
            type: 'image_url',
            image_url: {
              url: `data:${imgData.mimeType};base64,${imgData.base64}`,
            },
          })),
        ]

        return {
          role: msg.role,
          content,
        }
      }

      return {
        role: msg.role,
        content: msg.documentContent
          ? `${msg.content}\n\n${
              msg.documents
                ?.map(
                  (doc) =>
                    `Document title: ${doc.name}\nDocument contents:\n${msg.documentContent}`,
                )
                .join('\n\n') || `Document contents:\n${msg.documentContent}`
            }`
          : msg.content,
      }
    }),
  ]

  const body = JSON.stringify({
    model: model.modelName,
    messages,
    stream: true,
  })

  const requestInit: RequestInit = {
    method: 'POST',
    headers,
    body,
    signal,
  }

  return { proxyUrl, requestInit }
}
