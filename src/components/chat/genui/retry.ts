/**
 * Widget-only retry.
 *
 * When a GenUI tool call fails validation (the model emitted arguments the
 * widget's schema rejects), the whole assistant answer is usually fine —
 * only the one widget is broken. This helper re-asks the model for just
 * that tool call's arguments via a structured (JSON-schema constrained)
 * completion, so the failed widget can be patched in place without
 * regenerating the entire response.
 */
import type { BaseModel } from '@/config/models'
import { sendStructuredCompletion } from '@/services/inference/inference-client'
import { logError } from '@/utils/error-handling'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { Message } from '../types'
import { GENUI_WIDGETS_BY_NAME } from './registry'

/** How many trailing conversation messages accompany the re-ask. */
const RETRY_CONTEXT_MESSAGE_LIMIT = 8

/** Truncation cap for each context message sent with the re-ask. */
const RETRY_CONTEXT_MESSAGE_MAX_CHARS = 4000

function toPlainText(message: Message): string {
  if (message.content) return message.content
  // Assistant messages built from a timeline may keep their text in
  // content blocks rather than the top-level `content` field.
  if (message.timeline) {
    return message.timeline
      .filter((block) => block.type === 'content')
      .map((block) => block.content)
      .join('\n')
  }
  return ''
}

/**
 * Ask the model to regenerate the arguments for a single widget and
 * validate them against the widget's Zod schema.
 *
 * Returns the validated arguments serialized as a JSON string (the same
 * format tool-call blocks store), or `null` when the widget is unknown,
 * the request fails, or the regenerated arguments still don't validate.
 */
export async function regenerateToolCallArguments({
  toolName,
  contextMessages,
  model,
}: {
  toolName: string
  contextMessages: Message[]
  model: BaseModel
}): Promise<string | null> {
  const widget = GENUI_WIDGETS_BY_NAME[toolName]
  if (!widget) return null

  const jsonSchema = zodToJsonSchema(widget.schema, {
    target: 'openApi3',
    $refStrategy: 'none',
  }) as Record<string, unknown>

  const conversation = contextMessages
    .slice(-RETRY_CONTEXT_MESSAGE_LIMIT)
    .map((message) => ({
      role: message.role,
      content: toPlainText(message).slice(0, RETRY_CONTEXT_MESSAGE_MAX_CHARS),
    }))
    .filter((message) => message.content.trim().length > 0)

  try {
    const regenerated = await sendStructuredCompletion<unknown>({
      model,
      messages: [
        {
          role: 'system',
          content:
            `You previously tried to render a "${toolName}" UI component (${widget.description}) ` +
            'in this conversation, but the arguments were malformed. Based on the conversation, ' +
            'produce a valid set of arguments for that component. Respond with only the JSON arguments.',
        },
        ...conversation,
      ],
      jsonSchema,
    })

    const parsed = widget.schema.safeParse(regenerated)
    if (!parsed.success) {
      logError('Regenerated widget arguments failed validation', parsed.error, {
        component: 'genui-retry',
        action: 'regenerateToolCallArguments',
        metadata: { toolName },
      })
      return null
    }

    return JSON.stringify(parsed.data)
  } catch (error) {
    logError('Widget argument regeneration failed', error, {
      component: 'genui-retry',
      action: 'regenerateToolCallArguments',
      metadata: { toolName },
    })
    return null
  }
}
