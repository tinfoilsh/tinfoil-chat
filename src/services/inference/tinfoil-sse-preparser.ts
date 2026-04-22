/**
 * Tinfoil SSE pre-parser.
 *
 * Wraps a `fetch` so chat completion responses are split into two streams:
 * 1. A downstream SSE that only contains OpenAI-compliant `chat.completion.chunk`
 *    events (plus the terminal `data: [DONE]`), which the Vercel AI SDK can
 *    consume without choking on unknown event types.
 * 2. A sidechannel of Tinfoil-specific events the upstream streaming loop
 *    subscribes to: web search progress, URL fetches, url_citation
 *    annotations, and search_reasoning deltas.
 *
 * Two marker formats are supported so the UI works against both legacy and
 * current router builds:
 * - Legacy: top-level SSE records with `type: "web_search_call"` / `open_page`.
 * - Current: `<tinfoil-event>{...}</tinfoil-event>` markers embedded inside
 *   `delta.content` when the client opts in via the `X-Tinfoil-Events`
 *   header. Markers are stripped from content before the AI SDK sees it.
 *
 * The pre-parser only engages for responses whose content-type starts with
 * `text/event-stream`; other responses (errors, JSON bodies for non-streaming
 * endpoints) pass through untouched.
 */
import {
  createTinfoilEventParser,
  type TinfoilWebSearchCallEvent,
} from '@/utils/tinfoil-events'

export type TinfoilSidechannelEvent =
  | {
      type: 'web_search_call'
      id?: string
      status: 'in_progress' | 'completed' | 'failed' | 'blocked'
      query?: string
      reason?: string
      sources?: Array<{ title: string; url: string }>
    }
  | {
      type: 'url_fetch'
      id: string
      url: string
      status: 'fetching' | 'completed' | 'failed'
    }
  | {
      type: 'url_citation'
      title: string
      url: string
    }
  | {
      type: 'search_reasoning_delta'
      delta: string
    }

export interface TinfoilSidechannel {
  /**
   * Subscribe to Tinfoil events. Returns an unsubscribe function.
   */
  subscribe: (listener: (event: TinfoilSidechannelEvent) => void) => () => void
  /**
   * Emit an event to all subscribers. Exposed for the pre-parser; callers
   * outside this module should not use it.
   */
  emit: (event: TinfoilSidechannelEvent) => void
}

export function createTinfoilSidechannel(): TinfoilSidechannel {
  const listeners = new Set<(event: TinfoilSidechannelEvent) => void>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit(event) {
      for (const listener of listeners) {
        try {
          listener(event)
        } catch {
          // Listeners must not throw into the stream pipeline.
        }
      }
    },
  }
}

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: string | null
      reasoning_content?: string | null
      reasoning?: string | null
      search_reasoning?: string | null
      annotations?: unknown[]
      tool_calls?: unknown[]
      role?: string
    }
    index?: number
    finish_reason?: string | null
    [key: string]: unknown
  }>
  [key: string]: unknown
}

/**
 * Wrap a fetch implementation so streamed chat completion responses have
 * Tinfoil-specific events peeled off into the provided sidechannel.
 */
export function wrapFetchWithTinfoilPreparser(
  innerFetch: typeof fetch,
  sidechannel: TinfoilSidechannel,
): typeof fetch {
  return async (input, init) => {
    const response = await innerFetch(input as any, init)

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().startsWith('text/event-stream')) {
      return response
    }

    if (!response.body) {
      return response
    }

    const transformedBody = transformTinfoilStream(response.body, sidechannel)

    return new Response(transformedBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
}

function transformTinfoilStream(
  source: ReadableStream<Uint8Array>,
  sidechannel: TinfoilSidechannel,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let sseBuffer = ''
  // One parser per stream: it carries state across chunks so a marker
  // split on any byte boundary is still recognized on the next SSE event.
  const markerParser = createTinfoilEventParser()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            if (sseBuffer.length > 0) {
              processSseBlock(
                sseBuffer,
                controller,
                sidechannel,
                encoder,
                markerParser,
              )
              sseBuffer = ''
            }
            controller.close()
            return
          }

          sseBuffer += decoder.decode(value, { stream: true })

          // SSE events are separated by blank lines; a single event can span
          // multiple lines but always ends with \n\n (or \r\n\r\n).
          let boundary = findEventBoundary(sseBuffer)
          while (boundary !== -1) {
            const rawEvent = sseBuffer.slice(0, boundary)
            sseBuffer = sseBuffer.slice(boundary).replace(/^(\r?\n){2}/, '')
            processSseBlock(
              rawEvent,
              controller,
              sidechannel,
              encoder,
              markerParser,
            )
            boundary = findEventBoundary(sseBuffer)
          }
        }
      } catch (err) {
        controller.error(err)
      } finally {
        reader.releaseLock()
      }
    },
    cancel(reason) {
      source.cancel(reason).catch(() => undefined)
    },
  })
}

function findEventBoundary(buffer: string): number {
  const lfIdx = buffer.indexOf('\n\n')
  const crlfIdx = buffer.indexOf('\r\n\r\n')
  if (lfIdx === -1) return crlfIdx
  if (crlfIdx === -1) return lfIdx
  return Math.min(lfIdx, crlfIdx)
}

function processSseBlock(
  rawEvent: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  sidechannel: TinfoilSidechannel,
  encoder: TextEncoder,
  markerParser: ReturnType<typeof createTinfoilEventParser>,
): void {
  const trimmed = rawEvent.trim()
  if (!trimmed) return

  // Pass-through for the terminal sentinel.
  if (trimmed === 'data: [DONE]') {
    controller.enqueue(encoder.encode('data: [DONE]\n\n'))
    return
  }

  // SSE events may have multiple lines; we only care about `data: ...`.
  const dataLine = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('data:'))

  if (!dataLine) return

  const jsonPart = dataLine.replace(/^data:\s*/i, '')
  if (!jsonPart) return

  let parsed: any
  try {
    parsed = JSON.parse(jsonPart)
  } catch {
    // If we can't parse it, forward untouched so AI SDK can surface the error.
    controller.enqueue(encoder.encode(`data: ${jsonPart}\n\n`))
    return
  }

  // Handle Tinfoil-specific top-level events (web_search_call and open_page URL fetches).
  if (parsed?.type === 'web_search_call') {
    handleWebSearchEvent(parsed, sidechannel)
    return
  }

  // Only rewrite chat.completion.chunk events for annotations / search_reasoning.
  const chunk = parsed as ChatCompletionChunk
  const choice = chunk?.choices?.[0]
  const delta = choice?.delta

  if (delta) {
    // Lift url_citation annotations onto the sidechannel. These aren't
    // ordered relative to content; they describe the whole chunk.
    if (Array.isArray(delta.annotations) && delta.annotations.length > 0) {
      for (const ann of delta.annotations) {
        const a = ann as any
        if (a?.type === 'url_citation' && a?.url_citation?.url) {
          sidechannel.emit({
            type: 'url_citation',
            title: a.url_citation.title ?? a.url_citation.url,
            url: a.url_citation.url,
          })
        }
      }
    }

    // Lift search_reasoning deltas.
    const searchReasoning =
      typeof delta.search_reasoning === 'string'
        ? delta.search_reasoning
        : undefined
    if (searchReasoning) {
      sidechannel.emit({
        type: 'search_reasoning_delta',
        delta: searchReasoning,
      })
    }

    // Process any `<tinfoil-event>` progress markers the router embeds
    // inside `delta.content`. Pieces are interleaved with text in the
    // exact order they appeared so downstream segment builders can
    // place the event between the text that preceded it and the text
    // that followed it in the same chunk. We emit a separate downstream
    // SSE chunk per text piece and dispatch events between them; the
    // first emitted chunk carries any non-content fields (tool_calls,
    // reasoning, role, finish_reason, etc.) so nothing is dropped.
    if (typeof delta.content === 'string' && delta.content.length > 0) {
      const pieces = markerParser.consumeOrdered(delta.content)
      const textPieces = pieces.filter(
        (p): p is { type: 'text'; text: string } => p.type === 'text',
      )

      if (pieces.length === 0) {
        // Fully consumed into the parser's internal buffer (e.g. chunk
        // ends mid-marker). Forward the chunk with empty content so
        // other fields on the delta (tool_calls, finish_reason, ...)
        // are not lost while the marker finishes arriving.
        const emptyChunk = cloneChunkWithContent(chunk, '')
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(emptyChunk)}\n\n`),
        )
        return
      }

      let forwardedFirst = false
      for (const piece of pieces) {
        if (piece.type === 'text') {
          // Keep the original non-content fields on the first emitted
          // chunk; subsequent chunks only carry the split text so the
          // AI SDK doesn't double-count tool_calls or finish_reason.
          const textChunk = forwardedFirst
            ? chunkWithOnlyContent(chunk, piece.text)
            : cloneChunkWithContent(chunk, piece.text)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(textChunk)}\n\n`),
          )
          forwardedFirst = true
        } else {
          dispatchInlineMarkerEvent(piece.event, sidechannel)
        }
      }

      if (!forwardedFirst) {
        // All pieces were events (chunk was entirely markers). Still
        // forward an empty-content chunk so tool_calls / finish_reason
        // reach the AI SDK.
        const emptyChunk = cloneChunkWithContent(chunk, '')
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(emptyChunk)}\n\n`),
        )
      }
      return
    }
  }

  // Forward the (possibly-mutated) chunk to the downstream consumer.
  const payload = `data: ${JSON.stringify(chunk)}\n\n`
  controller.enqueue(encoder.encode(payload))
}

/**
 * Build a minimal chat completion chunk that only carries text content.
 * Used for the 2nd..Nth text piece when a single upstream chunk was split
 * around inline event markers — the first emitted chunk keeps the
 * non-content fields so tool_calls / finish_reason flow downstream
 * exactly once.
 */
function chunkWithOnlyContent(
  chunk: ChatCompletionChunk,
  content: string,
): ChatCompletionChunk {
  const firstChoice = chunk.choices?.[0] ?? {}
  const index = firstChoice.index ?? 0
  return {
    ...chunk,
    choices: [{ index, delta: { content } }],
  }
}

/**
 * Produce a shallow clone of `chunk` with `delta.content` replaced by
 * `content`. Preserves every other field (role, tool_calls, finish_reason,
 * reasoning_content, id, timestamps, etc.) so the per-piece chunks we emit
 * look identical to the original record apart from the split content.
 */
function cloneChunkWithContent(
  chunk: ChatCompletionChunk,
  content: string,
): ChatCompletionChunk {
  const choices = chunk.choices ?? []
  const nextChoices = choices.map((choice, index) => {
    if (index !== 0) return choice
    const delta = choice.delta ? { ...choice.delta, content } : { content }
    return { ...choice, delta }
  })
  return { ...chunk, choices: nextChoices }
}

function normalizeInlineMarkerSources(
  sources:
    | Array<{
        title?: string
        url?: string
      }>
    | undefined,
): Array<{ title: string; url: string }> | undefined {
  if (!sources || sources.length === 0) return undefined
  const normalized = sources.flatMap((source) => {
    if (!source?.url) return []
    return [
      {
        title: source.title || source.url,
        url: source.url,
      },
    ]
  })
  return normalized.length > 0 ? normalized : undefined
}

function dispatchInlineMarkerEvent(
  event: TinfoilWebSearchCallEvent,
  sidechannel: TinfoilSidechannel,
): void {
  // URL fetches arrive as action.type === 'open_page' markers.
  if (event.action?.type === 'open_page' && event.action.url) {
    const status = event.status
    // URLFetchState has no distinct `blocked` slot; collapse onto `failed`.
    const mapped: 'fetching' | 'completed' | 'failed' =
      status === 'in_progress'
        ? 'fetching'
        : status === 'completed'
          ? 'completed'
          : 'failed'
    sidechannel.emit({
      type: 'url_fetch',
      id: event.item_id || event.action.url,
      url: event.action.url,
      status: mapped,
    })
    return
  }

  // Web search progress. The router uses `searching` as an alias for
  // `in_progress` in some marker payloads; collapse both onto
  // `in_progress` for the downstream consumer.
  const status = event.status
  const normalizedStatus:
    | 'in_progress'
    | 'completed'
    | 'failed'
    | 'blocked'
    | null =
    status === 'in_progress' || status === 'searching'
      ? 'in_progress'
      : status === 'completed' || status === 'failed' || status === 'blocked'
        ? status
        : null
  if (!normalizedStatus) return

  sidechannel.emit({
    type: 'web_search_call',
    id: event.item_id,
    status: normalizedStatus,
    query: event.action?.query,
    reason: event.error?.code,
    sources: normalizeInlineMarkerSources(event.sources),
  })
}

function handleWebSearchEvent(
  event: any,
  sidechannel: TinfoilSidechannel,
): void {
  if (event?.action?.type === 'open_page' && event?.action?.url) {
    const status = event.status as string
    const mapped: 'fetching' | 'completed' | 'failed' =
      status === 'in_progress'
        ? 'fetching'
        : status === 'completed'
          ? 'completed'
          : 'failed'
    sidechannel.emit({
      type: 'url_fetch',
      id: (event.id as string) || (event.action.url as string),
      url: event.action.url as string,
      status: mapped,
    })
    return
  }

  const query = event?.action?.query as string | undefined
  const status = event?.status as string

  if (
    status === 'in_progress' ||
    status === 'completed' ||
    status === 'failed' ||
    status === 'blocked'
  ) {
    sidechannel.emit({
      type: 'web_search_call',
      id: typeof event?.id === 'string' ? (event.id as string) : undefined,
      status,
      query,
      reason: event?.reason as string | undefined,
      sources: normalizeInlineMarkerSources(
        Array.isArray(event?.sources)
          ? (event.sources as Array<{ title?: string; url?: string }>)
          : undefined,
      ),
    })
  }
}
