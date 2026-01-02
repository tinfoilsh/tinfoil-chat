import type { WebSearchState } from '@/components/chat/types'
import { LoadingDots } from '@/components/loading-dots'
import { memo, useState } from 'react'

interface WebSearchProcessProps {
  webSearch: WebSearchState
  isDarkMode: boolean
  messageId?: string
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

function FadeInFavicon({
  url,
  className,
  style,
}: {
  url: string
  className: string
  style?: React.CSSProperties
}) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  if (error) return null

  return (
    <img
      src={getFaviconUrl(url)}
      alt=""
      className={`${className} transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      style={style}
      onLoad={() => setLoaded(true)}
      onError={() => setError(true)}
    />
  )
}

export const WebSearchProcess = memo(function WebSearchProcess({
  webSearch,
  isDarkMode,
  messageId,
}: WebSearchProcessProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isSearching = webSearch.status === 'searching'
  const hasSources = webSearch.sources && webSearch.sources.length > 0

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
        className={`flex h-10 w-full items-center justify-between rounded-lg px-4 text-left text-content-primary transition-colors ${
          hasSources
            ? 'hover:bg-surface-secondary/50 cursor-pointer'
            : 'cursor-default'
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {hasSources && !isSearching && (
            <div className="flex shrink-0 items-center">
              {webSearch.sources!.slice(0, 5).map((source, index) => (
                <FadeInFavicon
                  key={`${source.url}-${index}`}
                  url={source.url}
                  className="h-4 w-4 shrink-0 rounded-full border border-surface-chat bg-surface-chat"
                  style={{ marginLeft: index === 0 ? 0 : -6 }}
                />
              ))}
            </div>
          )}
          {isSearching ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Searching the web...</span>
              {webSearch.query && (
                <span className="truncate text-sm opacity-70">
                  &quot;{webSearch.query}&quot;
                </span>
              )}
              <LoadingDots isThinking={true} isDarkMode={isDarkMode} />
            </div>
          ) : (
            <span className="text-sm leading-5">
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
              {webSearch.sources!.map((source, index) => (
                <a
                  key={`${source.url}-${index}`}
                  href={source.url}
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
                    {source.text && (
                      <p className="line-clamp-2 text-xs opacity-70">
                        {source.text}
                      </p>
                    )}
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
