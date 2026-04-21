/**
 * Streaming parser for `<tinfoil-event>...</tinfoil-event>` markers.
 *
 * The router rides opt-in web_search / fetch progress events inline with
 * the model's assistant text when the client sets the `X-Tinfoil-Events`
 * request header. Strict OpenAI SDKs render the tags as literal text; we
 * intercept them here so the UI can drive the existing webSearchState
 * and urlFetches surfaces without the raw tags leaking into the rendered
 * message.
 *
 * The parser is deliberately chunk-tolerant: markers can be split across
 * any byte boundary (inside the opening tag, inside the JSON body, or
 * inside the closing tag) because the upstream stream is not
 * newline-aligned. Callers feed each delta through `consume` and collect
 * (1) the visible text with every completed marker removed and
 * (2) the decoded event payloads. On stream end `flush` returns whatever
 * tail text remained. The buffer always carries forward only the minimal
 * unresolved suffix so the memory footprint stays O(marker size).
 */

/**
 * Name of the request header clients set to opt into the tinfoil-event
 * marker stream. Exported so the one place that builds the TinfoilAI
 * options can reference the same string as the parser.
 */
export const TINFOIL_EVENTS_HEADER = 'X-Tinfoil-Events'

/**
 * Value to send on the header to enable the router's web-search marker
 * stream. Forward compat: the header is comma-separated so additional
 * families can be added later.
 */
export const TINFOIL_EVENTS_VALUE_WEB_SEARCH = 'web_search'

/** The `type` value on every web_search_call marker payload. */
export const TINFOIL_WEB_SEARCH_CALL_TYPE = 'tinfoil.web_search_call'

const OPEN_TAG = '<tinfoil-event>'
const CLOSE_TAG = '</tinfoil-event>'

/**
 * Parsed web_search_call marker payload. Mirrors what the router
 * serializes: `item_id`, `status`, `action` (with optional `query` /
 * `url` / `type`) and an optional `error` object with a machine-readable
 * `code` describing the failure or safety block.
 */
export interface TinfoilWebSearchCallEvent {
  type: typeof TINFOIL_WEB_SEARCH_CALL_TYPE
  item_id?: string
  status: 'in_progress' | 'searching' | 'completed' | 'failed' | 'blocked'
  action?: {
    type?: 'search' | 'open_page'
    query?: string
    url?: string
  }
  error?: { code?: string }
}

/**
 * Result of consuming a single content chunk. `text` is the chunk with
 * every complete marker removed; `events` is the zero-or-more decoded
 * payloads the router emitted inside those markers.
 */
export interface TinfoilEventConsumeResult {
  text: string
  events: TinfoilWebSearchCallEvent[]
}

/**
 * Create a stateful parser bound to a single assistant turn. Chunks must
 * be fed through `consume` in order; at stream end callers should drain
 * any unterminated tail via `flush` so no characters are lost.
 */
export function createTinfoilEventParser(): {
  consume: (chunk: string) => TinfoilEventConsumeResult
  flush: () => string
} {
  // Holds any bytes we could not yet classify: either a partial open
  // tag being sniffed, or everything between an open tag and the
  // eventual close tag. Kept as a plain string so the memory cost is
  // bounded by the largest in-flight marker.
  let buffer = ''
  let insideMarker = false

  /**
   * Given a non-marker chunk suffix, return how many trailing bytes
   * might be the start of an opening tag. The parser holds those bytes
   * back until the next chunk arrives so `<tinfoil-event` split across
   * a boundary is still detected. A match is only plausible if the
   * suffix is a proper prefix of OPEN_TAG; everything shorter is
   * consumed as visible text.
   */
  const openTagPrefixSuffixLength = (s: string): number => {
    const max = Math.min(s.length, OPEN_TAG.length - 1)
    for (let len = max; len > 0; len--) {
      if (OPEN_TAG.startsWith(s.slice(s.length - len))) {
        return len
      }
    }
    return 0
  }

  const consume = (chunk: string): TinfoilEventConsumeResult => {
    buffer += chunk
    let text = ''
    const events: TinfoilWebSearchCallEvent[] = []

    while (buffer.length > 0) {
      if (!insideMarker) {
        const openIdx = buffer.indexOf(OPEN_TAG)
        if (openIdx < 0) {
          // No full open tag yet. Emit everything except any trailing
          // bytes that could still grow into `<tinfoil-event>`.
          const holdBack = openTagPrefixSuffixLength(buffer)
          text += buffer.slice(0, buffer.length - holdBack)
          buffer = buffer.slice(buffer.length - holdBack)
          break
        }
        // The router pads each marker with a leading newline so raw SSE
        // captures stay readable. Drop a single `\n` directly abutting
        // the open tag so the marker round-trips invisibly in the
        // rendered text instead of producing an empty line where the
        // marker used to be.
        const preTag =
          openIdx > 0 && buffer.charCodeAt(openIdx - 1) === 0x0a /* \n */
            ? buffer.slice(0, openIdx - 1)
            : buffer.slice(0, openIdx)
        text += preTag
        buffer = buffer.slice(openIdx + OPEN_TAG.length)
        insideMarker = true
        continue
      }

      const closeIdx = buffer.indexOf(CLOSE_TAG)
      if (closeIdx < 0) {
        // Full payload has not landed yet; wait for more bytes.
        break
      }
      const payload = buffer.slice(0, closeIdx)
      buffer = buffer.slice(closeIdx + CLOSE_TAG.length)
      // Match the leading-newline strip on the trailing side so a
      // `\n<marker>\n` pad collapses to nothing, not to `\n`.
      if (buffer.charCodeAt(0) === 0x0a) {
        buffer = buffer.slice(1)
      }
      insideMarker = false
      const event = parseMarkerPayload(payload)
      if (event) events.push(event)
    }

    return { text, events }
  }

  const flush = (): string => {
    // If we ended inside a marker the router emitted garbage — surface
    // the raw tail as plain text so at least the user sees something
    // rather than silently dropping bytes. Callers can still decide
    // whether to strip residual tags before display.
    const tail = buffer
    buffer = ''
    insideMarker = false
    return tail
  }

  return { consume, flush }
}

function parseMarkerPayload(raw: string): TinfoilWebSearchCallEvent | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const decoded = JSON.parse(trimmed) as unknown
    if (!decoded || typeof decoded !== 'object') return null
    const obj = decoded as Record<string, unknown>
    if (obj.type !== TINFOIL_WEB_SEARCH_CALL_TYPE) return null
    if (typeof obj.status !== 'string') return null
    return obj as unknown as TinfoilWebSearchCallEvent
  } catch {
    return null
  }
}

/**
 * One-shot helper for non-streaming content: runs a fresh parser across
 * the full string and returns both the cleaned text and the decoded
 * events. Use this for final assistant messages returned by the
 * non-streaming chat / responses paths, where the whole payload lands
 * in one chunk.
 */
export function extractTinfoilEventsFromText(input: string): {
  text: string
  events: TinfoilWebSearchCallEvent[]
} {
  const parser = createTinfoilEventParser()
  const { text, events } = parser.consume(input)
  const tail = parser.flush()
  return { text: text + tail, events }
}
