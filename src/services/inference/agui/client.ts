import { ChatError } from '@/components/chat/chat-utils'
import { HARNESS_REPO, HARNESS_URL, IS_DEV } from '@/config'
import { logError } from '@/utils/error-handling'
import {
  PERFORMANCE_METRICS,
  recordPerformanceDuration,
  startPerformanceTimer,
} from '@/utils/performance-metrics'
import { SecureClient, type VerificationDocument } from 'tinfoil'
import { sseJsonStream } from '../sse'
import { getSessionToken, invalidateSessionCache } from '../tinfoil-client'
import type {
  AguiEvent,
  AguiEventStream,
  RunAgentInput,
  RunStorage,
} from './protocol'

const DEV_AGUI_URL = '/api/local-router/agui'
const DEV_SIMULATOR_URL = '/api/dev/simulator'
// How many times a resume may come back with nothing new before the recovery
// is treated as stuck. Reset by every frame that arrives.
const MAX_RESUME_ATTEMPTS = 3
// How many times the harness may answer "not framed anything yet" before the
// run is given up on. Separate from the stall budget above: a run still in
// prompt processing has decided nothing, which is not the same as a replay
// that has stopped delivering. Twelve attempts of backed-off waiting is a
// little under a minute, comfortably inside the recovery scan's own age limit.
const MAX_NOT_READY_ATTEMPTS = 12
const RESUME_RETRY_BASE_DELAY_MS = 100
const RESUME_RETRY_MAX_DELAY_MS = 10_000

let ready: Promise<SecureClient> | null = null
let cachedVerificationDocument: VerificationDocument | null = null

function harnessClient(): Promise<SecureClient> {
  if (!ready) {
    const candidate = new SecureClient({
      enclaveURL: HARNESS_URL,
      configRepo: HARNESS_REPO,
    })
    const attestationStartedAt = startPerformanceTimer()
    ready = candidate
      .ready()
      .then(() => {
        recordPerformanceDuration(
          PERFORMANCE_METRICS.INFERENCE_ATTESTATION,
          attestationStartedAt,
        )
        return candidate
      })
      .catch((error) => {
        ready = null
        throw error
      })
  }
  return ready
}

export async function getHarnessVerificationDocument(): Promise<VerificationDocument | null> {
  if (IS_DEV) return null
  // An attestation that succeeded once outlives a later read that comes back
  // empty: the sidebar falls back to this cache when its retries run out, and
  // overwriting it with null would report a verified enclave as a failure.
  const document = (await harnessClient()).getVerificationDocument()
  if (document) cachedVerificationDocument = document
  return cachedVerificationDocument
}

export function getCachedHarnessVerificationDocument(): VerificationDocument | null {
  return cachedVerificationDocument
}

export async function runAgent(
  input: RunAgentInput,
  signal: AbortSignal,
): Promise<AguiEventStream> {
  const response = await withFreshSession(() => postRun(input, signal))

  if (!response.ok) {
    throw await refusal(response)
  }

  return sseJsonStream<AguiEvent>(response, 'agui-client')
}

async function postRun(
  input: RunAgentInput,
  signal: AbortSignal,
  lastEventId?: number | null,
): Promise<Response> {
  const apiKey = await getSessionToken(signal)
  const request: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${apiKey}`,
      ...(lastEventId === null || lastEventId === undefined
        ? {}
        : { 'Last-Event-ID': String(lastEventId) }),
    },
    body: JSON.stringify(input),
    signal,
  }

  return IS_DEV
    ? fetch(DEV_AGUI_URL, request)
    : (await harnessClient()).fetch(`${HARNESS_URL}/agui`, request)
}

export async function runSimulatedAgent(
  input: RunAgentInput,
  signal: AbortSignal,
): Promise<AguiEventStream> {
  const response = await fetch(DEV_SIMULATOR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  })
  if (!response.ok) {
    throw new ChatError(
      response.status === 404
        ? 'Dev simulator is only available in development environment'
        : `Dev simulator returned ${response.status}`,
      'SERVER_ERROR',
      { status: response.status },
    )
  }
  return sseJsonStream<AguiEvent>(response, 'agui-client')
}

/** A session key that expired in flight is worth exactly one retry. */
async function withFreshSession(
  send: () => Promise<Response>,
): Promise<Response> {
  const response = await send()
  if (response.status !== 401) return response
  await discard(response)
  invalidateSessionCache()
  return send()
}

/** A response nobody reads holds its connection open until it is collected. */
async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined)
}

async function refusal(response: Response): Promise<ChatError> {
  let message = `Request failed with status ${response.status}`
  try {
    const body: unknown = await response.json()
    const detail = body as { message?: unknown; error?: { message?: unknown } }
    const text = detail?.message ?? detail?.error?.message
    if (typeof text === 'string' && text) message = text
  } catch (error) {
    logError('Harness error body was not JSON', error, {
      component: 'agui-client',
      action: 'refusal',
      metadata: { status: response.status },
    })
  }

  return new ChatError(
    message,
    response.status === 429 ? 'RATE_LIMIT' : 'SERVER_ERROR',
    { status: response.status },
  )
}

/**
 * Thrown when the harness will not open a stored log: a secret that does not
 * open it and a log that is not there are refused identically, so this covers
 * "someone else's run", "already dropped", and the ordinary case of a run that
 * finished with its caller attached and was therefore never written down.
 */
export class RunGoneError extends Error {
  constructor(message = 'not a recoverable run') {
    super(message)
    this.name = 'RunGoneError'
  }
}

function hex128(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export function newRunStorage(): RunStorage {
  return { sessionId: hex128(), recoveryToken: hex128() }
}

/**
 * Come back to a run: the same pair, `resume`, and the id of the last frame
 * already seen. The harness serves everything after it -- from memory if it is
 * still running the run, otherwise from the log it spilled when this caller
 * let go -- so a connection that breaks mid-replay picks up where it stopped
 * and the events arrive as one uninterrupted stream.
 */
export async function* resumeRun(
  storage: RunStorage,
  signal: AbortSignal,
): AsyncGenerator<AguiEvent, void, undefined> {
  let from: number | null = null
  let stalled = 0
  let notReady = 0
  while (stalled < MAX_RESUME_ATTEMPTS) {
    const response = await withFreshSession(() =>
      postRun(resumeInput(storage), signal, from),
    )
    if (response.status === 403) {
      await discard(response)
      throw new RunGoneError()
    }
    if (response.status === 503) {
      // Nothing framed yet, so nothing can be decided about the run: the
      // harness says to come back rather than turning the caller away.
      await discard(response)
      if (notReady >= MAX_NOT_READY_ATTEMPTS) {
        throw new ChatError(
          'Recovered run was still starting up and never began sending',
          'SERVER_ERROR',
        )
      }
      await waitBeforeRetry(notReady++, signal, retryAfterMs(response))
      continue
    }
    if (!response.ok) throw await refusal(response)

    let terminal = false
    for await (const event of sseJsonStream<AguiEvent>(
      response,
      'agui-client',
      (id) => {
        from = id
        stalled = 0
        notReady = 0
      },
    )) {
      terminal ||= event.type === 'RUN_FINISHED' || event.type === 'RUN_ERROR'
      yield event
    }
    if (terminal) return
    await waitBeforeRetry(stalled++, signal)
  }
  throw new ChatError(
    'Recovered response stopped arriving before the run ended',
    'FETCH_ERROR',
  )
}

export async function dropRun(storage: RunStorage): Promise<void> {
  const send = async (): Promise<Response> => {
    const request: RequestInit = {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await getSessionToken()}`,
      },
      body: JSON.stringify(storage),
    }
    return IS_DEV
      ? fetch(DEV_AGUI_URL, request)
      : (await harnessClient()).fetch(`${HARNESS_URL}/agui`, request)
  }

  const response = await withFreshSession(send)
  // A log that cannot be opened is a log the caller asked to be gone.
  if (response.status === 403) return discard(response)
  if (!response.ok) throw await refusal(response)
}

function resumeInput(storage: RunStorage): RunAgentInput {
  return {
    // Replay carries no prompt and starts no run: the frames it serves were
    // framed by the original run and keep its ids. The one message is there
    // because the request parser reads the conversation before it reads
    // `resume`.
    threadId: '',
    runId: '',
    messages: [{ id: 'resume', role: 'user', content: '' }],
    resume: true,
    ...storage,
  }
}

function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get('Retry-After')
  const seconds = header === null ? NaN : Number(header)
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(seconds * 1000, RESUME_RETRY_MAX_DELAY_MS)
    : undefined
}

function waitBeforeRetry(
  attempt: number,
  signal: AbortSignal,
  requested?: number,
): Promise<void> {
  const delay =
    requested ??
    Math.min(
      RESUME_RETRY_BASE_DELAY_MS * 2 ** Math.max(attempt, 0),
      RESUME_RETRY_MAX_DELAY_MS,
    )
  return new Promise((resolve, reject) => {
    const abandon = () =>
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    if (signal.aborted) return abandon()
    const onAbort = () => {
      clearTimeout(timer)
      abandon()
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, delay)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
