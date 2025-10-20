import type { BaseModel } from '@/app/config/models'
import { ChatError } from '@/components/chat/chat-utils'
import type { Message } from '@/components/chat/types'
import { logError } from '@/utils/error-handling'
import { ChatQueryBuilder } from './chat-query-builder'
import { getTinfoilClient } from './tinfoil-client'

export interface SendChatStreamParams {
  model: BaseModel
  systemPrompt: string
  rules?: string
  updatedMessages: Message[]
  maxMessages: number
  signal: AbortSignal
}

export async function sendChatStream(
  params: SendChatStreamParams,
): Promise<Response> {
  const { model, systemPrompt, rules, updatedMessages, maxMessages, signal } =
    params

  if (model.modelName === 'dev-simulator') {
    const simulatorUrl = '/api/dev/simulator'
    const messages = ChatQueryBuilder.buildMessages({
      model,
      systemPrompt,
      rules,
      messages: updatedMessages,
      maxMessages,
    })

    try {
      const response = await fetch(simulatorUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model.modelName,
          messages,
          stream: true,
        }),
        signal,
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new ChatError(
            'Dev simulator is only available in development environment',
            'FETCH_ERROR',
          )
        }
        throw new ChatError(
          `Server returned ${response.status}: ${response.statusText}`,
          'FETCH_ERROR',
        )
      }

      return response
    } catch (err: unknown) {
      const anyErr = err as any
      if (
        (typeof DOMException !== 'undefined' &&
          anyErr instanceof DOMException &&
          anyErr.name === 'AbortError') ||
        anyErr?.name === 'AbortError'
      ) {
        throw err
      }

      if (err instanceof ChatError) {
        throw err
      }

      const msg = anyErr?.message || 'Unknown network error'
      throw new ChatError(`Network request failed: ${msg}`, 'FETCH_ERROR')
    }
  }

  try {
    const client = await getTinfoilClient()
    const messages = ChatQueryBuilder.buildMessages({
      model,
      systemPrompt,
      rules,
      messages: updatedMessages,
      maxMessages,
    })

    await client.ready()

    const stream = await client.chat.completions.create(
      {
        model: model.modelName,
        messages,
        stream: true,
      },
      { signal },
    )

    const encoder = new TextEncoder()
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const sseData = `data: ${JSON.stringify(chunk)}\n\n`
            controller.enqueue(encoder.encode(sseData))
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          logError('Stream processing error', error, {
            component: 'inference-client',
            action: 'sendChatStream',
          })
          controller.error(error)
        }
      },
    })

    return new Response(readableStream, {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  } catch (err: unknown) {
    const anyErr = err as any
    if (
      (typeof DOMException !== 'undefined' &&
        anyErr instanceof DOMException &&
        anyErr.name === 'AbortError') ||
      anyErr?.name === 'AbortError'
    ) {
      throw err
    }

    logError('Chat stream request failed', err, {
      component: 'inference-client',
      action: 'sendChatStream',
      metadata: {
        model: model.modelName,
        error: anyErr?.message,
        stack: anyErr?.stack,
      },
    })

    const msg = anyErr?.message || 'Unknown network error'
    throw new ChatError(`Network request failed: ${msg}`, 'FETCH_ERROR')
  }
}
