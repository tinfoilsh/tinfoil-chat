import {
  resetSummaryClient,
  summarize,
  SUMMARY_COOLDOWN_1_MS,
} from '@/services/inference/summary-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(),
}))

vi.mock('tinfoil', () => ({
  SecureClient: class {
    fetch = mockFetch
  },
}))

describe('summary client', () => {
  beforeEach(() => {
    resetSummaryClient()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('parses structured errors without retrying the request', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: 'Summarizer overloaded' },
          code: 'OVERLOADED',
          retryable: true,
        }),
        { status: 503 },
      ),
    )

    await expect(
      summarize({ content: 'content', style: 'title_summary' }),
    ).rejects.toMatchObject({
      message: 'Summarizer overloaded',
      kind: 'transient',
      code: 'OVERLOADED',
    })
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('keeps compatibility with legacy text errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('legacy failure', { status: 400 }),
    )

    await expect(
      summarize({ content: 'content', style: 'thoughts_summary' }),
    ).rejects.toMatchObject({
      message: 'legacy failure',
      kind: 'terminal',
      status: 400,
    })
  })

  it('opens a cooldown and allows only one half-open probe', async () => {
    let now = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    mockFetch.mockResolvedValueOnce(new Response('offline', { status: 503 }))

    await expect(
      summarize({ content: 'first', style: 'title_summary' }),
    ).rejects.toMatchObject({ kind: 'transient' })
    await expect(
      summarize({ content: 'blocked', style: 'thoughts_summary' }),
    ).rejects.toMatchObject({ kind: 'circuit-open' })
    expect(mockFetch).toHaveBeenCalledOnce()

    now += SUMMARY_COOLDOWN_1_MS
    let resolveProbe!: (response: Response) => void
    mockFetch.mockImplementationOnce(
      () => new Promise<Response>((resolve) => (resolveProbe = resolve)),
    )
    const probe = summarize({ content: 'probe', style: 'title_summary' })
    await expect(
      summarize({ content: 'second probe', style: 'thoughts_summary' }),
    ).rejects.toMatchObject({ kind: 'circuit-open' })

    resolveProbe(
      new Response(JSON.stringify({ summary: 'Recovered' }), { status: 200 }),
    )
    await expect(probe).resolves.toBe('Recovered')
  })

  it('validates successful responses', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ summary: '' }), { status: 200 }),
    )
    await expect(
      summarize({ content: 'content', style: 'title_summary' }),
    ).rejects.toMatchObject({
      kind: 'terminal',
      code: 'INVALID_RESPONSE',
    })
  })

  it('cancels active requests when client state is reset', async () => {
    mockFetch.mockImplementationOnce(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          )
        }),
    )

    const request = summarize({ content: 'private content', style: 'default' })
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledOnce())
    resetSummaryClient()

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('limits concurrent enclave requests', async () => {
    const resolvers: Array<(response: Response) => void> = []
    mockFetch.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(resolve)
        }),
    )

    const requests = ['one', 'two', 'three'].map((content) =>
      summarize({ content, style: 'default' }),
    )
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    resolvers.shift()?.(
      new Response(JSON.stringify({ summary: 'First' }), { status: 200 }),
    )
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3))
    resolvers.splice(0).forEach((resolve, index) =>
      resolve(
        new Response(JSON.stringify({ summary: `Next ${index}` }), {
          status: 200,
        }),
      ),
    )

    await expect(Promise.all(requests)).resolves.toEqual([
      'First',
      'Next 0',
      'Next 1',
    ])
  })
})
