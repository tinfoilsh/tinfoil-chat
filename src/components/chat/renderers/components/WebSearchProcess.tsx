import type { WebSearchState } from '@/components/chat/types'
import { sanitizeUrl } from '@braintree/sanitize-url'
import { memo, useCallback, useMemo, useState } from 'react'

const BOUNCE_DELAYS = ['0ms', '150ms', '300ms', '450ms', '600ms']

const webSearchFaviconCache = new Map<
  string,
  { loaded: boolean; error: boolean }
>()

interface WebSearchProcessProps {
  webSearch: WebSearchState
}

function getFaviconUrl(url: string): string {
  try {
    const parsedUrl = new URL(url)
    return `https://icons.duckduckgo.com/ip3/${parsedUrl.hostname}.ico`
  } catch {
    return ''
  }
}

function getDomainName(url: string): string {
  try {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname.replace(/^www\./, '')
    const parts = hostname.split('.')
    return parts.length > 1 ? parts[parts.length - 2] : hostname
  } catch {
    return ''
  }
}

function BouncingPlaceholder({
  index,
  style,
}: {
  index: number
  style?: React.CSSProperties
}) {
  return (
    <span
      className="block h-4 w-4 shrink-0 animate-spring-horizontal rounded-full bg-content-primary/30"
      style={{
        ...style,
        animationDelay: BOUNCE_DELAYS[index] || '0ms',
      }}
    />
  )
}

function FadeInFavicon({
  url,
  className,
  style,
  showPlaceholder,
  index,
  onLoad,
  onError,
}: {
  url: string
  className: string
  style?: React.CSSProperties
  showPlaceholder?: boolean
  index?: number
  onLoad?: () => void
  onError?: () => void
}) {
  const faviconUrl = getFaviconUrl(url)
  const cached = webSearchFaviconCache.get(faviconUrl)
  const [loaded, setLoaded] = useState(cached?.loaded ?? false)
  const [error, setError] = useState(cached?.error ?? false)

  const handleLoad = () => {
    setLoaded(true)
    webSearchFaviconCache.set(faviconUrl, { loaded: true, error: false })
    onLoad?.()
  }

  const handleError = () => {
    setError(true)
    webSearchFaviconCache.set(faviconUrl, { loaded: false, error: true })
    onError?.()
  }

  if (error) return null

  return (
    <span className="relative block" style={style}>
      {showPlaceholder && !loaded && (
        <BouncingPlaceholder
          index={index ?? 0}
          style={{ position: 'absolute' }}
        />
      )}
      <img
        src={faviconUrl}
        alt=""
        className={`${className} transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={handleLoad}
        onError={handleError}
      />
    </span>
  )
}

export const WebSearchProcess = memo(function WebSearchProcess({
  webSearch,
}: WebSearchProcessProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isSearching = webSearch.status === 'searching'
  const isFailed = webSearch.status === 'failed'
  const isBlocked = webSearch.status === 'blocked'

  // Deduplicate sources by URL for display
  const uniqueSources = useMemo(() => {
    if (!webSearch.sources) return []
    const seen = new Set<string>()
    return webSearch.sources.filter((source) => {
      if (seen.has(source.url)) return false
      seen.add(source.url)
      return true
    })
  }, [webSearch.sources])

  const hasSources = uniqueSources.length > 0
  const sourcesToShow = uniqueSources.slice(0, 5)

  // Track which favicons have loaded/errored (by index)
  const [loadedFavicons, setLoadedFavicons] = useState<Set<number>>(new Set())

  // Show placeholders if still searching OR if not all favicons have loaded yet
  const allFaviconsReady =
    sourcesToShow.length > 0 && loadedFavicons.size >= sourcesToShow.length
  const showPlaceholders = isSearching || !allFaviconsReady

  const handleFaviconLoad = useCallback((index: number) => {
    setLoadedFavicons((prev) => new Set(prev).add(index))
  }, [])

  const handleFaviconError = useCallback((index: number) => {
    // Treat errors as "ready" so we don't wait forever
    setLoadedFavicons((prev) => new Set(prev).add(index))
  }, [])

  const handleToggle = () => {
    if (hasSources) {
      setIsExpanded(!isExpanded)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleToggle}
        disabled={!hasSources}
        className={`group flex items-start gap-1.5 rounded-md px-1 py-1 text-left transition-colors ${
          hasSources
            ? 'hover:bg-surface-secondary/50 cursor-pointer'
            : 'cursor-default'
        }`}
      >
        {hasSources && (
          <svg
            className={`mt-[5px] h-3.5 w-3.5 shrink-0 transform text-content-primary/40 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
            focusable="false"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        )}
        <span className="min-w-0 text-lg text-content-primary/50">
          {isSearching ? (
            <>
              <span className="font-medium">Searching the web...</span>
            </>
          ) : isFailed ? (
            <>
              <span className="font-medium">Search failed</span>
              {webSearch.query && (
                <span className="font-normal">
                  {' '}
                  for &quot;{webSearch.query}&quot;
                </span>
              )}
            </>
          ) : isBlocked ? (
            <>
              <span className="font-medium">Web search blocked</span>
              {webSearch.reason && (
                <span className="font-normal"> — {webSearch.reason}</span>
              )}
            </>
          ) : (
            <>
              <span className="font-medium">Searched the web</span>
              {webSearch.query && (
                <span className="font-normal">
                  {' '}
                  for &quot;{webSearch.query}&quot;
                </span>
              )}
              {hasSources && (
                <span
                  className="inline-flex items-center align-middle"
                  style={{ marginLeft: 6 }}
                >
                  {sourcesToShow.map((source, index) => (
                    <FadeInFavicon
                      key={`${source.url}-${index}`}
                      url={source.url}
                      className="h-4 w-4 shrink-0 rounded-full border border-surface-chat bg-surface-chat"
                      style={{ marginLeft: index === 0 ? 0 : -6 }}
                      showPlaceholder={false}
                      index={index}
                      onLoad={() => handleFaviconLoad(index)}
                      onError={() => handleFaviconError(index)}
                    />
                  ))}
                </span>
              )}
            </>
          )}
        </span>
      </button>

      {hasSources && (
        <div
          className="overflow-hidden transition-all duration-300 ease-out"
          style={{
            maxHeight: isExpanded ? '1000px' : '0px',
          }}
        >
          <div className="ml-2 border-l-2 border-border-subtle py-2 pl-3 pr-1">
            <div className="flex flex-col gap-2">
              {uniqueSources.map((source, index) => (
                <a
                  key={`${source.url}-${index}`}
                  href={sanitizeUrl(source.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:bg-surface-secondary/50 flex items-start gap-3 rounded-md px-2 py-1.5 text-sm text-content-primary/70 transition-colors"
                >
                  <FadeInFavicon
                    url={source.url}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded-full"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-xs opacity-50">
                      {getDomainName(source.url)}
                    </span>
                    <span className="truncate font-medium">{source.title}</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
