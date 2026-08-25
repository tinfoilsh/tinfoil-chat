import { sseJsonStream } from '@/services/inference/sse'
import { describe, expect, it } from 'vitest'

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

type Frame = Record<string, any>

async function collectAll(response: Response): Promise<Frame[]> {
  const results: Frame[] = []
  for await (const frame of sseJsonStream<Frame>(response, 'test')) {
    results.push(frame)
  }
  return results
}

describe('sseJsonStream', () => {
  it('parses basic SSE data lines', async () => {
    const results = await collectAll(
      mockResponse(['data: {"choices":[{"delta":{"content":"hi"}}]}\n\n']),
    )
    expect(results).toHaveLength(1)
    expect(results[0].choices?.[0]?.delta?.content).toBe('hi')
  })

  it('handles multiple events in one chunk', async () => {
    const results = await collectAll(
      mockResponse(['data: {"id":"1"}\n\ndata: {"id":"2"}\n\n']),
    )
    expect(results).toEqual([{ id: '1' }, { id: '2' }])
  })

  it('reassembles events split across chunks', async () => {
    const results = await collectAll(
      mockResponse(['data: {"id":', '"split"}\n\n']),
    )
    expect(results).toEqual([{ id: 'split' }])
  })

  it('stops on the DONE sentinel', async () => {
    const results = await collectAll(
      mockResponse([
        'data: {"id":"1"}\n\ndata: [DONE]\n\ndata: {"id":"2"}\n\n',
      ]),
    )
    expect(results).toEqual([{ id: '1' }])
  })

  it('cancels the response body after the DONE sentinel', async () => {
    let cancelled = false
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
        },
        cancel() {
          cancelled = true
        },
      }),
    )

    await collectAll(response)

    expect(cancelled).toBe(true)
  })

  it('skips non-data and empty lines', async () => {
    const results = await collectAll(
      mockResponse(['\n\nevent: message\ndata: {"id":"1"}\n\n\n\n']),
    )
    expect(results).toEqual([{ id: '1' }])
  })

  it('skips malformed JSON', async () => {
    const results = await collectAll(
      mockResponse(['data: {bad json}\n\ndata: {"id":"good"}\n\n']),
    )
    expect(results).toEqual([{ id: 'good' }])
  })

  it('skips non-object JSON', async () => {
    const results = await collectAll(
      mockResponse([
        'data: null\n\ndata: ["invalid"]\n\ndata: {"id":"good"}\n\n',
      ]),
    )
    expect(results).toEqual([{ id: 'good' }])
  })

  it('returns nothing for an empty response body', async () => {
    await expect(collectAll(new Response(null))).resolves.toEqual([])
  })

  it('handles CRLF line endings', async () => {
    const results = await collectAll(
      mockResponse(['data: {"id":"1"}\r\n\r\ndata: {"id":"2"}\r\n\r\n']),
    )
    expect(results).toEqual([{ id: '1' }, { id: '2' }])
  })

  it('reports the id of each frame it hands over', async () => {
    const ids: number[] = []
    const results: Frame[] = []
    const response = mockResponse([
      'id: 0\ndata: {"id":"first"}\n\nid: 1\ndata: {"id":"second"}\n\n',
    ])
    for await (const frame of sseJsonStream<Frame>(response, 'test', (id) =>
      ids.push(id),
    )) {
      results.push(frame)
    }

    expect(results).toEqual([{ id: 'first' }, { id: 'second' }])
    expect(ids).toEqual([0, 1])
  })

  it('reports no id for a frame that carries none', async () => {
    const ids: number[] = []
    const response = mockResponse([
      'id: 4\ndata: {"id":"framed"}\n\ndata: {"id":"bare"}\n\n',
    ])
    for await (const _frame of sseJsonStream<Frame>(response, 'test', (id) =>
      ids.push(id),
    )) {
      // drain
    }

    expect(ids).toEqual([4])
  })

  it('reports the id of a frame that carries it after the data', async () => {
    const ids: number[] = []
    const response = mockResponse(['data: {"id":"first"}\nid: 7\n\n'])
    for await (const _frame of sseJsonStream<Frame>(response, 'test', (id) =>
      ids.push(id),
    )) {
      // drain
    }

    expect(ids).toEqual([7])
  })

  it('drops a frame the stream ends without terminating', async () => {
    const results = await collectAll(
      mockResponse(['data: {"id":"first"}\n\ndata: {"id":"cut"}']),
    )
    expect(results).toEqual([{ id: 'first' }])
  })

  it('preserves response stream errors', async () => {
    const streamError = new Error('stream failed')
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(streamError)
        },
      }),
    )

    await expect(collectAll(response)).rejects.toBe(streamError)
  })
})
