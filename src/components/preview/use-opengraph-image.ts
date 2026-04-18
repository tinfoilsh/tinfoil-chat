/**
 * Hook for fetching an OpenGraph image via the self-hosted Tinfoil metadata
 * enclave. Returns the supplied `fallback` immediately when provided; otherwise
 * lazily requests the `og:image` for `url` and returns it once resolved.
 */
import { useEffect, useState } from 'react'

import { fetchOpenGraphImage } from '@/services/inference/opengraph-client'

export function useOpenGraphImage(
  url: string | undefined,
  fallback?: string,
): string | null {
  const [fetched, setFetched] = useState<string | null>(null)

  useEffect(() => {
    if (fallback || !url) return
    if (typeof window === 'undefined') return

    let cancelled = false
    fetchOpenGraphImage(url).then((image) => {
      if (!cancelled) setFetched(image)
    })

    return () => {
      cancelled = true
    }
  }, [url, fallback])

  return fallback ?? fetched
}
