import { readSSEStream } from '@/components/chat/hooks/streaming/sse-reader'
import { describe, expect, it } from 'vitest'

/** Creates a mock Response from an array of string chunks. */
function mockResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  let index = 0
  const readable = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]))
        index++
      } else {
        controller.close()
      }
    },
  })
  return new Response(readable)
}

/** Collects all yielded values from the SSE reader. */
async function collectAll(
  response: Response,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = []
  for await (const json of readSSEStream(response)) {
    results.push(json)
  }
  return results
}

describe('readSSEStream', () => {
  it('parses basic SSE data lines', async () => {
    const response = mockResponse([
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
    ])
    const results = await collectAll(response)
    expect(results).toHaveLength(1)
    expect((results[0] as any).choices[0].delta.content).toBe('hi')
  })

  it('handles multiple events in one chunk', async () => {
    const response = mockResponse(['data: {"id":"1"}\n\ndata: {"id":"2"}\n\n'])
    const results = await collectAll(response)
    expect(results).toHaveLength(2)
    expect(results[0].id).toBe('1')
    expect(results[1].id).toBe('2')
  })

  it('reassembles events split across chunks', async () => {
    const response = mockResponse(['data: {"id":', '"split"}\n\n'])
    const results = await collectAll(response)
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('split')
  })

  it('stops on [DONE] sentinel', async () => {
    const response = mockResponse(['data: {"id":"1"}\n\ndata: [DONE]\n\n'])
    const results = await collectAll(response)
    expect(results).toHaveLength(1)
  })

  it('skips non-data lines', async () => {
    const response = mockResponse(['event: message\ndata: {"id":"1"}\n\n'])
    const results = await collectAll(response)
    expect(results).toHaveLength(1)
  })

  it('skips empty lines', async () => {
    const response = mockResponse(['\n\ndata: {"id":"1"}\n\n\n\n'])
    const results = await collectAll(response)
    expect(results).toHaveLength(1)
  })

  it('handles malformed JSON gracefully', async () => {
    const response = mockResponse([
      'data: {bad json}\n\ndata: {"id":"good"}\n\n',
    ])
    const results = await collectAll(response)
    // Bad JSON is skipped, good one comes through
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('good')
  })

  it('returns nothing for empty response body', async () => {
    const response = new Response(null)
    const results = await collectAll(response)
    expect(results).toEqual([])
  })

  it('handles \\r\\n line endings', async () => {
    const response = mockResponse([
      'data: {"id":"1"}\r\n\r\ndata: {"id":"2"}\r\n\r\n',
    ])
    const results = await collectAll(response)
    expect(results).toHaveLength(2)
  })
})
