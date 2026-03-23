import type { URLFetchState } from '@/components/chat/types'
import { memo, useMemo } from 'react'

interface URLFetchProcessProps {
  urlFetches: URLFetchState[]
}

function getDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.replace(/^www\./, '')
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    return hostname + path
  } catch {
    return url
  }
}

function getFaviconUrl(url: string): string {
  try {
    const parsedUrl = new URL(url)
    return `https://icons.duckduckgo.com/ip3/${parsedUrl.hostname}.ico`
  } catch {
    return ''
  }
}

function FetchSpinner() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0 animate-spin text-content-primary/50"
      viewBox="0 0 16 16"
      fill="none"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="28"
        strokeDashoffset="8"
      />
    </svg>
  )
}

export const URLFetchProcess = memo(function URLFetchProcess({
  urlFetches,
}: URLFetchProcessProps) {
  const anyFetching = useMemo(
    () => urlFetches.some((f) => f.status === 'fetching'),
    [urlFetches],
  )

  return (
    <div>
      <div className="flex flex-col gap-0.5 px-1 py-1">
        {urlFetches.map((fetch) => (
          <div
            key={fetch.id}
            className="flex min-h-7 items-center gap-2 text-base"
          >
            {fetch.status === 'fetching' ? (
              <FetchSpinner />
            ) : (
              <img
                src={getFaviconUrl(fetch.url)}
                alt=""
                className="h-3.5 w-3.5 shrink-0 rounded-sm"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            )}
            <span
              className={`min-w-0 truncate ${
                fetch.status === 'failed'
                  ? 'text-content-primary/40 line-through'
                  : 'text-content-primary/50'
              }`}
            >
              {fetch.status === 'fetching' ? (
                <>
                  <span className="font-medium text-content-primary/50">
                    Reading{' '}
                  </span>
                  {getDisplayUrl(fetch.url)}
                </>
              ) : fetch.status === 'completed' ? (
                <>
                  <span className="font-medium text-content-primary/50">
                    Read{' '}
                  </span>
                  {getDisplayUrl(fetch.url)}
                </>
              ) : (
                <>
                  <span className="font-medium">Failed to read </span>
                  {getDisplayUrl(fetch.url)}
                </>
              )}
            </span>
          </div>
        ))}
        {anyFetching && urlFetches.length === 1 && (
          <span className="text-xs text-content-primary/40">
            Fetching page contents...
          </span>
        )}
      </div>
    </div>
  )
})
