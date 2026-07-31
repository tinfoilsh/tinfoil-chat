import { fetchFavicon } from '@/services/inference/metadata-client'
import { useEffect, useState } from 'react'

// Module-level cache of resolved favicon data URLs keyed by hostname.
// Keeps remounts — for example, when react-markdown re-parses a
// streaming message and recreates citation pills — from flashing back
// through the loading placeholder once the icon has already been
// fetched.
const RESOLVED_FAVICON_DATA_URLS = new Map<string, string>()

// Hostnames whose favicon lookup recently failed, with the time the failure
// expires. Streaming remounts would otherwise re-request a failing host on
// every re-render; the TTL still allows retries after transient outages.
const FAILED_FAVICON_EXPIRY = new Map<string, number>()
const FAILED_FAVICON_TTL_MS = 60_000

function isFailureCached(key: string): boolean {
  const expiry = FAILED_FAVICON_EXPIRY.get(key)
  if (expiry === undefined) return false
  if (Date.now() > expiry) {
    FAILED_FAVICON_EXPIRY.delete(key)
    return false
  }
  return true
}

function cacheFailure(key: string): void {
  FAILED_FAVICON_EXPIRY.set(key, Date.now() + FAILED_FAVICON_TTL_MS)
}

type FaviconState = 'loading' | 'ready' | 'error'

interface ResolvedFavicon {
  src: string
  state: FaviconState
}

function initialResolved(key: string): ResolvedFavicon {
  const existing = RESOLVED_FAVICON_DATA_URLS.get(key)
  if (existing) return { src: existing, state: 'ready' }
  if (isFailureCached(key)) return { src: '', state: 'error' }
  return { src: '', state: 'loading' }
}

function faviconCacheKey(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return url
  }
}

/**
 * Favicon <img> that loads the icon through the attested metadata
 * enclave. The bytes come back inlined in the `/favicon` response and
 * are rendered as a `data:` URL so the browser never reaches an
 * external icon host directly. Using a `data:` URL keeps the lifecycle
 * trivial: there's no Blob to allocate and no `URL.createObjectURL`
 * handle to revoke, so two concurrent components rendering the same
 * favicon can never invalidate each other's source.
 */
interface FaviconProps extends Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'onError' | 'onLoad'
> {
  /** Page URL used to identify the favicon hostname. */
  url: string
  /** Rendered until the favicon bytes resolve. */
  placeholder?: React.ReactNode
  /** Rendered when no bytes are available. */
  fallback?: React.ReactNode
  /** Called once the image has fully loaded. */
  onResolve?: () => void
  /** Called when the image fails to load. */
  onResolveError?: () => void
}

export function Favicon({ url, ...props }: FaviconProps) {
  const cacheKey = faviconCacheKey(url)
  return (
    <FaviconForHost key={cacheKey} url={url} cacheKey={cacheKey} {...props} />
  )
}

function FaviconForHost({
  url,
  cacheKey,
  placeholder = null,
  fallback = null,
  onResolve,
  onResolveError,
  alt = '',
  className,
  ...imgProps
}: FaviconProps & { cacheKey: string }) {
  const [resolved, setResolved] = useState<ResolvedFavicon>(() =>
    initialResolved(cacheKey),
  )

  useEffect(() => {
    let cancelled = false

    const cached = RESOLVED_FAVICON_DATA_URLS.get(cacheKey)
    if (cached) {
      setResolved({ src: cached, state: 'ready' })
      return () => {
        cancelled = true
      }
    }
    if (isFailureCached(cacheKey)) {
      setResolved({ src: '', state: 'error' })
      return () => {
        cancelled = true
      }
    }

    fetchFavicon(url)
      .then((faviconDataUrl) => {
        if (cancelled) return
        if (!faviconDataUrl) {
          cacheFailure(cacheKey)
          setResolved({ src: '', state: 'error' })
          return
        }
        RESOLVED_FAVICON_DATA_URLS.set(cacheKey, faviconDataUrl)
        setResolved({ src: faviconDataUrl, state: 'ready' })
      })
      .catch(() => {
        if (cancelled) return
        cacheFailure(cacheKey)
        setResolved({ src: '', state: 'error' })
      })

    return () => {
      cancelled = true
    }
  }, [cacheKey, url])

  if (resolved.state === 'error') return <>{fallback}</>
  if (resolved.state === 'loading') return <>{placeholder}</>

  return (
    <img
      {...imgProps}
      src={resolved.src}
      alt={alt}
      className={className}
      onLoad={() => {
        onResolve?.()
      }}
      onError={() => {
        if (RESOLVED_FAVICON_DATA_URLS.get(cacheKey) === resolved.src) {
          RESOLVED_FAVICON_DATA_URLS.delete(cacheKey)
        }
        setResolved({ src: '', state: 'error' })
        onResolveError?.()
      }}
    />
  )
}
