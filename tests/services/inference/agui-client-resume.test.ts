import type { AguiEvent, RunStorage } from '@/services/inference/agui/protocol'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSessionToken = vi.fn(async () => 'api-key')
const invalidateSessionCache = vi.fn()

vi.mock('@/config', () => ({
  IS_DEV: true,
  HARNESS_URL: 'https://harness.example',
  HARNESS_REPO: 'tinfoilsh/harness',
}))

vi.mock('@/services/inference/tinfoil-client', () => ({
  getSessionToken: () => getSessionToken(),
  invalidateSessionCache: () => invalidateSessionCache(),
}))

vi.mock('tinfoil', () => ({
  SecureClient: class SecureClient {},
}))

vi.mock('@/utils/error-handling', () => ({ logError: vi.fn() }))

import {
  dropRun,
  newRunStorage,
  resumeRun,
  RunGoneError,
} from '@/services/inference/agui/client'

const STORAGE: RunStorage = {
  sessionId: '0123456789abcdef0123456789abcdef',
  recoveryToken: 'fedcba9876543210fedcba9876543210',
}

/** An SSE body framed the way the harness frames one, ids and all. */
function framed(from: number, events: AguiEvent[]): Response {
  const body = events
    .map(
      (event, index) =>
        `id: ${from + index}\ndata: ${JSON.stringify(event)}\n\n`,
    )
    .join('')
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function refusal(
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ message: 'not a recoverable run' }), {
    status,
    headers,
  })
}

const chunk = (delta: string): AguiEvent => ({
  type: 'TEXT_MESSAGE_CHUNK',
  messageId: 'msg-1',
  delta,
})
const finished: AguiEvent = { type: 'RUN_FINISHED' }

let fetchMock: ReturnType<typeof vi.fn>

async function collect(signal = new AbortController().signal) {
  const events: AguiEvent[] = []
  for await (const event of resumeRun(STORAGE, signal)) events.push(event)
  return events
}

function requestOf(call: number) {
  const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit]
  return {
    url,
    init,
    body: JSON.parse(init.body as string),
    headers: init.headers as Record<string, string>,
  }
}

describe('coming back to a run', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('mints a distinct 128-bit pair', () => {
    const first = newRunStorage()
    const second = newRunStorage()

    expect(first.sessionId).toMatch(/^[0-9a-f]{32}$/)
    expect(first.recoveryToken).toMatch(/^[0-9a-f]{32}$/)
    expect(first.sessionId).not.toBe(first.recoveryToken)
    expect(second.sessionId).not.toBe(first.sessionId)
  })

  it('asks for the run by its pair and takes the log from the top', async () => {
    fetchMock.mockResolvedValueOnce(framed(0, [chunk('Recovered'), finished]))

    await expect(collect()).resolves.toEqual([chunk('Recovered'), finished])

    const request = requestOf(0)
    expect(request.body).toMatchObject({ ...STORAGE, resume: true })
    expect(request.body.messages).toHaveLength(1)
    expect(request.headers['Last-Event-ID']).toBeUndefined()
    expect(request.headers.Authorization).toBe('Bearer api-key')
  })

  it('comes back at the frame it stopped on and reads as one stream', async () => {
    fetchMock
      .mockResolvedValueOnce(framed(0, [chunk('Half ')]))
      .mockResolvedValueOnce(framed(1, [chunk('an answer'), finished]))

    await expect(collect()).resolves.toEqual([
      chunk('Half '),
      chunk('an answer'),
      finished,
    ])
    expect(requestOf(1).headers['Last-Event-ID']).toBe('0')
  })

  it('waits the interval it is given when the run has not framed anything yet', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce(refusal(503, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(framed(0, [chunk('Recovered'), finished]))

    const events = collect()
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    vi.useRealTimers()

    await expect(events).resolves.toEqual([chunk('Recovered'), finished])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps waiting on a run that is slow to frame its first event', async () => {
    fetchMock
      .mockResolvedValueOnce(refusal(503, { 'Retry-After': '0' }))
      .mockResolvedValueOnce(refusal(503, { 'Retry-After': '0' }))
      .mockResolvedValueOnce(refusal(503, { 'Retry-After': '0' }))
      .mockResolvedValueOnce(refusal(503, { 'Retry-After': '0' }))
      .mockResolvedValueOnce(refusal(503, { 'Retry-After': '0' }))
      .mockResolvedValueOnce(framed(0, [chunk('Recovered'), finished]))

    // The stall budget is three attempts; waiting on a run that has decided
    // nothing yet must not be spent out of it.
    await expect(collect()).resolves.toEqual([chunk('Recovered'), finished])
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it('gives up on a run that never starts framing', async () => {
    fetchMock.mockResolvedValue(refusal(503, { 'Retry-After': '0' }))

    await expect(collect()).rejects.toThrow('still starting up')
  })

  it('reports a log it cannot open as gone', async () => {
    fetchMock.mockResolvedValue(refusal(403))

    await expect(collect()).rejects.toBeInstanceOf(RunGoneError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries an expired session key once', async () => {
    fetchMock
      .mockResolvedValueOnce(refusal(401))
      .mockResolvedValueOnce(framed(0, [finished]))

    await expect(collect()).resolves.toEqual([finished])
    expect(invalidateSessionCache).toHaveBeenCalledTimes(1)
  })

  it('gives up on a replay that never reaches the end of the run', async () => {
    fetchMock.mockResolvedValue(framed(0, []))

    await expect(collect()).rejects.toThrow('stopped arriving')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('stops when the caller lets go', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(async () => {
      controller.abort()
      return framed(0, [])
    })

    await expect(collect(controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})

describe('dropping a stored run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('deletes the log by the same pair that reads it', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(dropRun(STORAGE)).resolves.toBeUndefined()

    const request = requestOf(0)
    expect(request.init.method).toBe('DELETE')
    expect(request.body).toEqual(STORAGE)
  })

  it('treats a log it cannot open as already gone', async () => {
    fetchMock.mockResolvedValueOnce(refusal(403))

    await expect(dropRun(STORAGE)).resolves.toBeUndefined()
  })

  it('retries an expired session key once', async () => {
    fetchMock
      .mockResolvedValueOnce(refusal(401))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(dropRun(STORAGE)).resolves.toBeUndefined()
    expect(invalidateSessionCache).toHaveBeenCalledTimes(1)
    expect(requestOf(1).init.method).toBe('DELETE')
  })

  it('surfaces a store that would not drop the log', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'the store did not drop it' }), {
        status: 502,
      }),
    )

    await expect(dropRun(STORAGE)).rejects.toThrow('the store did not drop it')
  })
})
