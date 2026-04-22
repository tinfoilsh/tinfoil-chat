import type { URLFetchState } from '@/components/chat/types'
import { memo, useMemo, useState } from 'react'
import { PiSpinner } from 'react-icons/pi'

interface URLFetchProcessProps {
  urlFetches: URLFetchState[]
  /**
   * When true and `urlFetches` contains more than one entry, the component
   * renders a collapsed "Read N links" row that expands on click, instead
   * of stacking one row per URL. Keeps long fetch runs from vertically
   * polluting the chat.
   */
  grouped?: boolean
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
    <PiSpinner className="h-3.5 w-3.5 shrink-0 animate-spin text-content-primary/50" />
  )
}

/// Single row rendering one fetched URL. Used by both the flat and
/// grouped (collapsed) URL-fetch views so presentation tweaks stay in
/// one place. `compact` drops the verb prefix ("Read ", "Reading ") that
/// only makes sense when the row stands alone; the grouped header
/// already conveys that state for its children.
function URLFetchRow({
  fetch,
  compact,
}: {
  fetch: URLFetchState
  compact: boolean
}) {
  const textSize = compact ? 'text-sm' : 'text-base'
  const textTone = compact
    ? 'text-content-primary/60'
    : 'text-content-primary/50'

  return (
    <div className={`flex min-h-7 items-center gap-2 ${textSize}`}>
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
            : textTone
        }`}
      >
        {compact ? (
          getDisplayUrl(fetch.url)
        ) : fetch.status === 'fetching' ? (
          <>
            <span className="font-medium text-content-primary/50">
              Reading{' '}
            </span>
            {getDisplayUrl(fetch.url)}
          </>
        ) : fetch.status === 'completed' ? (
          <>
            <span className="font-medium text-content-primary/50">Read </span>
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
  )
}

export const URLFetchProcess = memo(function URLFetchProcess({
  urlFetches,
  grouped,
}: URLFetchProcessProps) {
  const anyFetching = useMemo(
    () => urlFetches.some((f) => f.status === 'fetching'),
    [urlFetches],
  )

  const shouldCollapse = !!grouped && urlFetches.length > 1
  if (shouldCollapse) {
    return <GroupedURLFetchProcess urlFetches={urlFetches} />
  }

  return (
    <div>
      <div className="flex flex-col gap-0.5 px-1 py-1">
        {urlFetches.map((fetch) => (
          <URLFetchRow key={fetch.id} fetch={fetch} compact={false} />
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

const GroupedURLFetchProcess = memo(function GroupedURLFetchProcess({
  urlFetches,
}: {
  urlFetches: URLFetchState[]
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const anyFetching = useMemo(
    () => urlFetches.some((f) => f.status === 'fetching'),
    [urlFetches],
  )
  const completedCount = useMemo(
    () => urlFetches.filter((f) => f.status === 'completed').length,
    [urlFetches],
  )
  const count = urlFetches.length
  const label = anyFetching
    ? `Reading ${count} link${count === 1 ? '' : 's'}`
    : `Read ${completedCount} link${completedCount === 1 ? '' : 's'}`

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="hover:bg-surface-secondary/50 group flex cursor-pointer items-start gap-1.5 rounded-md px-1 py-1 text-left transition-colors"
      >
        <span className="mt-[5px] h-3.5 w-3.5 shrink-0" aria-hidden="true">
          <svg
            className={`h-3.5 w-3.5 transform text-content-primary/40 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </span>
        <span className="min-w-0 text-base text-content-primary/50">
          <span className="font-medium">{label}</span>
        </span>
      </button>

      <div
        className="grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="ml-2 flex flex-col gap-0.5 border-l-2 border-border-subtle py-2 pl-3 pr-1">
            {urlFetches.map((fetch) => (
              <URLFetchRow key={fetch.id} fetch={fetch} compact />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
})
