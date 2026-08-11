import { fetchFavicon } from '@/services/inference/metadata-client'
import { useEffect, useState } from 'react'

type FaviconState = 'loading' | 'ready' | 'error'

interface ResolvedFavicon {
  src: string
  state: FaviconState
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
  const [resolved, setResolved] = useState<ResolvedFavicon>({
    src: '',
    state: 'loading',
  })

  useEffect(() => {
    let cancelled = false

    fetchFavicon(url)
      .then((faviconDataUrl) => {
        if (cancelled) return
        setResolved(
          faviconDataUrl
            ? { src: faviconDataUrl, state: 'ready' }
            : { src: '', state: 'error' },
        )
      })
      .catch(() => {
        if (!cancelled) setResolved({ src: '', state: 'error' })
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
        setResolved({ src: '', state: 'error' })
        onResolveError?.()
      }}
    />
  )
}
