import { logError } from '@/utils/error-handling'

export async function* sseJsonStream<T>(
  response: Response,
  component: string,
  // Every frame the harness sends carries a monotonic `id:`; a caller that
  // means to come back to the run records it as each event is handed over.
  onEventId?: (id: number) => void,
): AsyncGenerator<T, void, undefined> {
  const reader = response.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let buffer = ''
  let exhausted = false
  // A frame's fields may arrive in any order, so neither field is acted on
  // until the blank line that closes the frame. Reading `id:` only when it
  // happens to precede `data:` would silently lose the resume point.
  let eventId: number | null = null
  let data: string | null = null

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) exhausted = true
      else buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split(/\r?\n/)
      // Only a blank line closes a frame; a cut tail is replayed on resume.
      if (!done) buffer = lines.pop() ?? ''

      for (const rawLine of lines) {
        const line = rawLine.trim()

        if (line) {
          if (line.startsWith('id:')) {
            const parsed = Number(line.slice(3).trim())
            eventId =
              Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
          } else if (line.startsWith('data:')) {
            const chunk = line.replace(/^data:\s*/i, '')
            data = data === null ? chunk : `${data}\n${chunk}`
          }
          continue
        }

        const frame = data
        const id = eventId
        data = null
        eventId = null
        if (frame === null) continue
        if (frame === '[DONE]') return

        try {
          const parsed: unknown = JSON.parse(frame)
          if (
            typeof parsed !== 'object' ||
            parsed === null ||
            Array.isArray(parsed)
          ) {
            throw new TypeError('SSE data must be a JSON object')
          }
          if (id !== null) onEventId?.(id)
          yield parsed as T
        } catch (error) {
          logError('Failed to parse SSE line', error, {
            component,
            metadata: { line: frame },
          })
        }
      }

      if (done) break
    }
  } finally {
    if (!exhausted) await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
