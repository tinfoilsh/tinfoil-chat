import {
  TINFOIL_WEB_SEARCH_CALL_TYPE,
  createTinfoilEventParser,
  extractTinfoilEventsFromText,
} from '@/utils/tinfoil-events'
import { describe, expect, it } from 'vitest'

function markerFor(payload: Record<string, unknown>): string {
  return `<tinfoil-event>${JSON.stringify(payload)}</tinfoil-event>`
}

describe('createTinfoilEventParser', () => {
  it('extracts a marker delivered in a single chunk', () => {
    const parser = createTinfoilEventParser()
    const payload = {
      type: TINFOIL_WEB_SEARCH_CALL_TYPE,
      item_id: 'ws_1',
      status: 'in_progress',
      action: { type: 'search', query: 'q' },
    }
    const input = `prefix ${markerFor(payload)} suffix`
    const result = parser.consume(input)
    expect(result.text).toBe('prefix  suffix')
    expect(result.events).toHaveLength(1)
    expect(result.events[0].status).toBe('in_progress')
    expect(result.events[0].action?.query).toBe('q')
    expect(parser.flush()).toBe('')
  })

  it('stitches a marker split across an arbitrary byte boundary', () => {
    const parser = createTinfoilEventParser()
    const payload = {
      type: TINFOIL_WEB_SEARCH_CALL_TYPE,
      item_id: 'ws_1',
      status: 'completed',
      action: { type: 'search', query: 'hello world' },
    }
    const full = markerFor(payload)
    // Split every single character — the parser must hold state across
    // every boundary, including mid-tag, mid-JSON, and mid-close-tag.
    const out: string[] = []
    const events = []
    for (const ch of full) {
      const r = parser.consume(ch)
      out.push(r.text)
      events.push(...r.events)
    }
    out.push(parser.flush())
    expect(out.join('')).toBe('')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('completed')
  })

  it('does not emit a trailing partial open tag as visible text', () => {
    const parser = createTinfoilEventParser()
    // The suffix `<tinfoil-` could grow into a real open tag; the
    // parser must hold it back rather than leak it to the UI.
    const result = parser.consume('hello <tinfoil-')
    expect(result.text).toBe('hello ')
    expect(result.events).toEqual([])
    // Completing the tag + payload emits the event, still suppressing
    // the raw tags from the visible text.
    const payload = {
      type: TINFOIL_WEB_SEARCH_CALL_TYPE,
      item_id: 'ws_1',
      status: 'completed',
      action: { type: 'search', query: 'q' },
    }
    const rest = `event>${JSON.stringify(payload)}</tinfoil-event>tail`
    const second = parser.consume(rest)
    expect(second.text).toBe('tail')
    expect(second.events).toHaveLength(1)
  })

  it('handles multiple markers in one chunk with surrounding text', () => {
    const parser = createTinfoilEventParser()
    const a = markerFor({
      type: TINFOIL_WEB_SEARCH_CALL_TYPE,
      item_id: 'ws_1',
      status: 'in_progress',
      action: { type: 'search', query: 'a' },
    })
    const b = markerFor({
      type: TINFOIL_WEB_SEARCH_CALL_TYPE,
      item_id: 'ws_1',
      status: 'completed',
      action: { type: 'search', query: 'a' },
    })
    const result = parser.consume(`L${a}M${b}R`)
    expect(result.text).toBe('LMR')
    expect(result.events.map((e) => e.status)).toEqual([
      'in_progress',
      'completed',
    ])
  })

  it('drops malformed JSON payloads without breaking later markers', () => {
    const parser = createTinfoilEventParser()
    const malformed = '<tinfoil-event>{not json}</tinfoil-event>'
    const good = markerFor({
      type: TINFOIL_WEB_SEARCH_CALL_TYPE,
      item_id: 'ws_2',
      status: 'completed',
      action: { type: 'search', query: 'q' },
    })
    const result = parser.consume(`${malformed}keep${good}`)
    expect(result.text).toBe('keep')
    expect(result.events).toHaveLength(1)
    expect(result.events[0].item_id).toBe('ws_2')
  })

  it('ignores foreign JSON payloads that are not tinfoil.web_search_call', () => {
    const parser = createTinfoilEventParser()
    const foreign = '<tinfoil-event>{"type":"other.kind"}</tinfoil-event>'
    const result = parser.consume(foreign)
    expect(result.text).toBe('')
    expect(result.events).toEqual([])
  })

  it('flushes unterminated marker body without leaking the open tag', () => {
    const parser = createTinfoilEventParser()
    const first = parser.consume('hello <tinfoil-event>{"type":"')
    // The chunk before the opening tag flows through verbatim.
    expect(first.text).toBe('hello ')
    // Stream ends mid-marker; the parser already consumed the opening
    // tag and entered the marker body, so the flushed tail surfaces
    // only the uninterpreted JSON fragment. The opening tag itself
    // stays suppressed so the UI never renders raw `<tinfoil-event>`.
    const tail = parser.flush()
    expect(tail).not.toContain('<tinfoil-event>')
    expect(tail).toBe('{"type":"')
  })
})

describe('extractTinfoilEventsFromText', () => {
  it('processes a full non-streaming message in one call', () => {
    const payload = {
      type: TINFOIL_WEB_SEARCH_CALL_TYPE,
      item_id: 'ws_1',
      status: 'completed',
      action: { type: 'search', query: 'q' },
    }
    const input = `\n${markerFor(payload)}\nAnswer.`
    const { text, events } = extractTinfoilEventsFromText(input)
    expect(text).toBe('\n\nAnswer.')
    expect(events).toHaveLength(1)
    expect(events[0].action?.query).toBe('q')
  })

  it('returns the original text when no markers are present', () => {
    const { text, events } = extractTinfoilEventsFromText(
      'plain answer without events',
    )
    expect(text).toBe('plain answer without events')
    expect(events).toEqual([])
  })
})
