import { logError } from '@/utils/error-handling'

const SSE_DONE = '[DONE]'

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
  // A frame's fields may arrive in any order, so neither field is acted on
  // until the blank line that closes the frame. Reading `id:` only when it
  // happens to precede `data:` would silently lose the resume point.
  let eventId: number | null = null
  let data: string | null = null

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        // Whatever `buffer` still holds is an event the stream was cut off
        // mid-way; the spec discards it, and a resume replays it in full.
        break
      }
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split(/\r?\n/)
      // Only a blank line closes a frame, so the trailing segment is never a
      // finished line: hold it back until the bytes that terminate it arrive.
      buffer = lines.pop() ?? ''

      for (const rawLine of lines) {
        const line = rawLine.trim()

        if (line) {
          if (line.startsWith('id:')) {
            const raw = line.slice(3).trim()
            const parsed = Number(raw)
            eventId =
              raw !== '' && Number.isSafeInteger(parsed) && parsed >= 0
                ? parsed
                : null
          } else if (line.startsWith('data:')) {
            const chunk = line.replace(/^data:\s*/, '')
            data = data === null ? chunk : `${data}\n${chunk}`
          }
          continue
        }

        const frame = data
        const id = eventId
        data = null
        eventId = null
        if (frame === null) continue
        if (frame === SSE_DONE) return

        let payload: unknown
        try {
          payload = JSON.parse(frame)
          if (
            typeof payload !== 'object' ||
            payload === null ||
            Array.isArray(payload)
          ) {
            throw new TypeError('SSE data must be a JSON object')
          }
        } catch (error) {
          // Only a bad frame is survivable; handing the frame over is the
          // caller's business, so it stays outside the catch where a throw
          // from the consumer would be mislabelled and the stream limp on.
          logError('Failed to parse SSE line', error, {
            component,
            metadata: { line: frame },
          })
          continue
        }

        if (id !== null) onEventId?.(id)
        yield payload as T
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
