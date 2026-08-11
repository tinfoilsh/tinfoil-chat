import { logError } from '@/utils/error-handling'
import { SecureClient } from 'tinfoil'
import { z } from 'zod'

/**
 * Opengraph-metadata client.
 *
 * Fetches title/description/site_name/image for a URL
 * from the attested `opengraph-metadata.tinfoil.sh` enclave. Used by
 * the GenUI link-preview widget to replace model-generated fields with
 * verified values scraped server-side inside a Tinfoil CVM.
 */

const METADATA_ENCLAVE = 'https://opengraph-metadata.tinfoil.sh'
const METADATA_CONFIG_REPO = 'tinfoilsh/confidential-website-metadata-fetcher'
const CACHE_MAX_ENTRIES = 200
const METADATA_SUCCESS_TTL_MS = 10 * 60 * 1000
const FAVICON_SUCCESS_TTL_MS = 24 * 60 * 60 * 1000
const FAILURE_BASE_COOLDOWN_MS = 60 * 1000
const FAILURE_MAX_COOLDOWN_MS = 5 * 60 * 1000

const nullableString = z.string().nullable().optional()
const metadataResponseSchema = z.object({
  url: z.string().optional(),
  title: nullableString,
  description: nullableString,
  site_name: nullableString,
  image: nullableString,
  cached: z.boolean().optional(),
})
const faviconResponseSchema = z.object({
  status: z.enum(['found', 'missing']).optional(),
  found: z.boolean().optional(),
  favicon_bytes: nullableString,
  favicon_content_type: nullableString,
})
const structuredErrorSchema = z
  .object({
    error: z.union([
      z.string(),
      z.object({
        message: z.string().optional(),
        code: z.string().optional(),
        retryable: z.boolean().optional(),
        transient: z.boolean().optional(),
      }),
    ]),
    code: z.string().optional(),
    retryable: z.boolean().optional(),
    transient: z.boolean().optional(),
  })
  .passthrough()

let cachedClient: SecureClient | null = null

function getClient(): SecureClient {
  if (!cachedClient) {
    cachedClient = new SecureClient({
      enclaveURL: METADATA_ENCLAVE,
      configRepo: METADATA_CONFIG_REPO,
    })
  }
  return cachedClient
}

export interface LinkMetadata {
  url: string
  title: string | null
  description: string | null
  siteName: string | null
  image: string | null
  cached: boolean
}

export class MetadataClientError extends Error {
  constructor(
    message: string,
    public readonly kind: 'transient' | 'terminal' | 'validation',
    public readonly status?: number,
    public readonly code?: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'MetadataClientError'
  }
}

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

interface FailureEntry {
  error: MetadataClientError
  expiresAt: number
  failures: number
}

const metadataPromiseByUrl = new Map<string, Promise<LinkMetadata>>()
const faviconPromiseByHost = new Map<string, Promise<string | null>>()
const metadataCache = new Map<string, CacheEntry<LinkMetadata>>()
const faviconCache = new Map<string, CacheEntry<string | null>>()
const metadataFailures = new Map<string, FailureEntry>()
const faviconFailures = new Map<string, FailureEntry>()
const activeControllers = new Set<AbortController>()
let cacheGeneration = 0

export function fetchLinkMetadata(url: string): Promise<LinkMetadata> {
  let key: string
  try {
    key = canonicalUrl(url)
  } catch (error) {
    return Promise.reject(error)
  }
  const cached = readCache(metadataCache, key)
  if (cached !== undefined) return Promise.resolve(cached)
  const failure = readFailure(metadataFailures, key)
  if (failure) return Promise.reject(failure)
  const existing = metadataPromiseByUrl.get(key)
  if (existing) return existing

  const generation = cacheGeneration
  const controller = new AbortController()
  activeControllers.add(controller)
  const promise: Promise<LinkMetadata> = doFetchLinkMetadata(
    key,
    controller.signal,
  )
    .then((metadata) => {
      if (generation === cacheGeneration) {
        metadataFailures.delete(key)
        setBounded(metadataCache, key, {
          value: metadata,
          expiresAt: Date.now() + METADATA_SUCCESS_TTL_MS,
        })
      }
      return metadata
    })
    .catch((error) => {
      if (generation !== cacheGeneration) throw error
      throw cacheFailure(metadataFailures, key, error, 'fetchLinkMetadata')
    })
    .finally(() => {
      activeControllers.delete(controller)
      if (metadataPromiseByUrl.get(key) === promise) {
        metadataPromiseByUrl.delete(key)
      }
    })
  metadataPromiseByUrl.set(key, promise)
  return promise
}

/** Fetch only a favicon without requesting the page through Zyte. */
export function fetchFavicon(url: string): Promise<string | null> {
  let canonical: string
  try {
    canonical = canonicalUrl(url)
  } catch (error) {
    return Promise.reject(error)
  }
  const key = canonicalHost(canonical)
  const cached = readCache(faviconCache, key)
  if (cached !== undefined) return Promise.resolve(cached)
  const failure = readFailure(faviconFailures, key)
  if (failure) return Promise.reject(failure)
  const existing = faviconPromiseByHost.get(key)
  if (existing) return existing

  const generation = cacheGeneration
  const controller = new AbortController()
  activeControllers.add(controller)
  const promise: Promise<string | null> = doFetchFavicon(
    canonical,
    controller.signal,
  )
    .then((favicon) => {
      if (generation === cacheGeneration) {
        faviconFailures.delete(key)
        setBounded(faviconCache, key, {
          value: favicon,
          expiresAt: Date.now() + FAVICON_SUCCESS_TTL_MS,
        })
      }
      return favicon
    })
    .catch((error) => {
      if (generation !== cacheGeneration) throw error
      throw cacheFailure(faviconFailures, key, error, 'fetchFavicon')
    })
    .finally(() => {
      activeControllers.delete(controller)
      if (faviconPromiseByHost.get(key) === promise) {
        faviconPromiseByHost.delete(key)
      }
    })
  faviconPromiseByHost.set(key, promise)
  return promise
}

async function doFetchLinkMetadata(
  url: string,
  signal: AbortSignal,
): Promise<LinkMetadata> {
  const response = await getClient().fetch(`${METADATA_ENCLAVE}/metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal,
  })
  const body = await readJson(response)
  assertSuccessfulResponse(response, body)
  const parsed = metadataResponseSchema.safeParse(body)
  if (!parsed.success) {
    throw new MetadataClientError(
      'Metadata response failed validation',
      'validation',
      response.status,
      'INVALID_RESPONSE',
      { cause: parsed.error },
    )
  }
  return {
    url,
    title: trimmedOrNull(parsed.data.title),
    description: trimmedOrNull(parsed.data.description),
    siteName: trimmedOrNull(parsed.data.site_name),
    image: validHttpUrlOrNull(parsed.data.image),
    cached: parsed.data.cached ?? false,
  }
}

async function doFetchFavicon(
  url: string,
  signal: AbortSignal,
): Promise<string | null> {
  const response = await getClient().fetch(`${METADATA_ENCLAVE}/favicon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal,
  })
  const body = await readJson(response)
  assertSuccessfulResponse(response, body)
  const parsed = faviconResponseSchema.safeParse(body)
  if (!parsed.success) {
    throw new MetadataClientError(
      'Favicon response failed validation',
      'validation',
      response.status,
      'INVALID_RESPONSE',
      { cause: parsed.error },
    )
  }
  if (parsed.data.status === 'missing' || parsed.data.found === false)
    return null
  const faviconBytes = trimmedOrNull(parsed.data.favicon_bytes)
  const favicon = buildFaviconDataUrl(
    faviconBytes,
    trimmedOrNull(parsed.data.favicon_content_type),
  )
  if (faviconBytes && !favicon) {
    throw new MetadataClientError(
      'Favicon response failed validation',
      'validation',
      response.status,
      'INVALID_RESPONSE',
    )
  }
  return favicon
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (error) {
    throw new MetadataClientError(
      'Metadata service returned invalid JSON',
      response.ok
        ? 'validation'
        : response.status >= 500
          ? 'transient'
          : 'terminal',
      response.status,
      'INVALID_JSON',
      { cause: error },
    )
  }
}

function assertSuccessfulResponse(response: Response, body: unknown): void {
  const structured = structuredErrorSchema.safeParse(body)
  if (response.ok && !structured.success) return
  if (response.ok && structured.success) {
    throw structuredServiceError(response.status, structured.data)
  }
  if (structured.success) {
    throw structuredServiceError(response.status, structured.data)
  }
  const transient = isTransientStatus(response.status)
  throw new MetadataClientError(
    'Metadata service request failed',
    transient ? 'transient' : 'terminal',
    response.status,
    `HTTP_${response.status}`,
  )
}

function structuredServiceError(
  status: number,
  body: z.infer<typeof structuredErrorSchema>,
): MetadataClientError {
  const message =
    typeof body.error === 'string'
      ? body.error
      : (body.error.message ?? 'Metadata service request failed')
  const transient =
    body.retryable === true ||
    body.transient === true ||
    (typeof body.error !== 'string' &&
      (body.error.retryable === true || body.error.transient === true)) ||
    isTransientStatus(status)
  return new MetadataClientError(
    message,
    transient ? 'transient' : 'terminal',
    status,
    body.code ?? (typeof body.error === 'string' ? undefined : body.error.code),
  )
}

function cacheFailure(
  cache: Map<string, FailureEntry>,
  key: string,
  error: unknown,
  action: string,
): MetadataClientError {
  const typed =
    error instanceof MetadataClientError
      ? error
      : new MetadataClientError(
          'Metadata service is unavailable',
          'transient',
          undefined,
          'NETWORK',
          {
            cause: error,
          },
        )
  const failures = (cache.get(key)?.failures ?? 0) + 1
  const cooldown = Math.min(
    FAILURE_BASE_COOLDOWN_MS * 2 ** (failures - 1),
    FAILURE_MAX_COOLDOWN_MS,
  )
  setBounded(cache, key, {
    error: typed,
    failures,
    expiresAt: Date.now() + cooldown,
  })
  logError('Metadata service request failed', typed, {
    component: 'metadata-client',
    action,
    metadata: { status: typed.status, code: typed.code, cooldown },
  })
  return typed
}

function readFailure(
  cache: Map<string, FailureEntry>,
  key: string,
): MetadataClientError | null {
  const entry = cache.get(key)
  return entry && entry.expiresAt > Date.now() ? entry.error : null
}

function readCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
): T | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return undefined
  }
  return entry.value
}

function setBounded<T>(cache: Map<string, T>, key: string, value: T): void {
  cache.delete(key)
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, value)
}

function canonicalUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch (error) {
    throw new MetadataClientError(
      'URL is invalid',
      'validation',
      undefined,
      'INVALID_URL',
      {
        cause: error,
      },
    )
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new MetadataClientError(
      'URL must use HTTP or HTTPS',
      'validation',
      undefined,
      'INVALID_URL',
    )
  }
  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  return url.toString()
}

function canonicalHost(url: string): string {
  return new URL(url).host.toLowerCase()
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function validHttpUrlOrNull(value: string | null | undefined): string | null {
  const trimmed = trimmedOrNull(value)
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.toString()
      : null
  } catch {
    return null
  }
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function buildFaviconDataUrl(
  base64: string | null,
  contentType: string | null,
): string | null {
  if (!base64) return null
  const type = contentType ?? 'image/x-icon'
  if (!type.toLowerCase().startsWith('image/')) return null
  return `data:${type};base64,${base64}`
}

export function resetMetadataClient(): void {
  cacheGeneration++
  const resetError = new DOMException('Metadata client reset', 'AbortError')
  for (const controller of activeControllers) controller.abort(resetError)
  cachedClient = null
  metadataPromiseByUrl.clear()
  faviconPromiseByHost.clear()
  metadataCache.clear()
  faviconCache.clear()
  metadataFailures.clear()
  faviconFailures.clear()
}
