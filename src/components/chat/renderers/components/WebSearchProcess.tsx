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
    return `https://www.google.com/s2/favicons?sz=32&domain=${parsedUrl.hostname}`
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
    <div
      className="h-4 w-4 shrink-0 animate-spring-horizontal rounded-full bg-content-primary/30"
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
    <div className="relative" style={style}>
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
    </div>
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
    <div className="mb-2 mt-2 rounded-lg border border-border-subtle bg-transparent">
      <button
        type="button"
        onClick={handleToggle}
        disabled={!hasSources}
        className={`flex min-h-10 w-full justify-between rounded-lg px-4 py-2 text-left text-content-primary transition-colors ${
          isBlocked ? 'items-start' : 'items-center'
        } ${
          hasSources
            ? 'hover:bg-surface-secondary/50 cursor-pointer'
            : 'cursor-default'
        }`}
      >
        <div
          className={`flex min-w-0 flex-1 gap-3 ${isBlocked ? 'items-start' : 'items-center'}`}
        >
          {hasSources && (
            <div className="flex shrink-0 items-center">
              {sourcesToShow.map((source, index) => (
                <FadeInFavicon
                  key={`${source.url}-${index}`}
                  url={source.url}
                  className="h-4 w-4 shrink-0 rounded-full border border-surface-chat bg-surface-chat"
                  style={{ marginLeft: index === 0 ? 0 : -6 }}
                  showPlaceholder={showPlaceholders}
                  index={index}
                  onLoad={() => handleFaviconLoad(index)}
                  onError={() => handleFaviconError(index)}
                />
              ))}
            </div>
          )}
          {!hasSources && isSearching && (
            <div className="flex shrink-0 items-center">
              {[0, 1, 2, 3, 4].map((index) => (
                <BouncingPlaceholder
                  key={index}
                  index={index}
                  style={{ marginLeft: index === 0 ? 0 : -6 }}
                />
              ))}
            </div>
          )}
          {isSearching ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 text-sm font-medium">
                Searching the web...
              </span>
              {webSearch.query && (
                <span className="truncate text-sm opacity-70">
                  &quot;{webSearch.query}&quot;
                </span>
              )}
            </div>
          ) : isFailed ? (
            <span className="min-w-0 truncate text-sm leading-5">
              <span className="font-medium opacity-70">Search failed</span>
              {webSearch.query && (
                <span className="font-normal opacity-70">
                  {' '}
                  for &quot;{webSearch.query}&quot;
                </span>
              )}
            </span>
          ) : isBlocked ? (
            <span className="min-w-0 text-sm leading-5 opacity-50">
              <span className="font-medium">Web search blocked</span>
              {webSearch.reason && (
                <span className="font-normal"> — {webSearch.reason}</span>
              )}
            </span>
          ) : (
            <span className="min-w-0 text-sm leading-5">
              <span className="font-medium opacity-70">Searched the web</span>
              {webSearch.query && (
                <span className="font-normal opacity-70">
                  {' '}
                  for &quot;{webSearch.query}&quot;
                </span>
              )}
            </span>
          )}
        </div>
        {hasSources && (
          <svg
            className={`h-5 w-5 shrink-0 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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
              d="M19 9l-7 7-7-7"
            />
          </svg>
        )}
      </button>

      {hasSources && (
        <div
          className="overflow-hidden transition-all duration-300 ease-out"
          style={{
            maxHeight: isExpanded ? '1000px' : '0px',
          }}
        >
          <div className="px-4 py-3">
            <div className="flex flex-col gap-3">
              {uniqueSources.map((source, index) => (
                <a
                  key={`${source.url}-${index}`}
                  href={sanitizeUrl(source.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:bg-surface-secondary/50 flex items-start gap-3 rounded-lg px-3 py-2 text-sm text-content-primary transition-colors"
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
