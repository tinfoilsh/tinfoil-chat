/**
 * Async generator that reads an SSE response body and yields parsed JSON
 * objects, one per `data:` line. Handles chunk reassembly, line splitting,
 * and the `[DONE]` sentinel. No domain knowledge.
 */

import type { StreamLogger } from '@/utils/dev-stream-logger'
import { logError } from '@/utils/error-handling'

export async function* readSSEStream(
  response: Response,
  logger?: StreamLogger,
): AsyncGenerator<Record<string, unknown>, void, undefined> {
  const reader = response.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue
      if (line === 'data: [DONE]' || !line.startsWith('data:')) continue

      logger?.logRaw(line)

      try {
        const jsonData = line.replace(/^data:\s*/i, '')
        const json = JSON.parse(jsonData) as Record<string, unknown>
        logger?.logParsedEvent(json)
        yield json
      } catch (error) {
        logError('Failed to parse SSE line', error, {
          component: 'sse-reader',
          metadata: { line },
        })
      }
    }
  }
}
