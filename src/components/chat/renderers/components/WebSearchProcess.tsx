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
                <img
                  key={`${source.url}-${index}`}
                  src={getFaviconUrl(source.url)}
                  alt=""
                  className="h-5 w-5 shrink-0 rounded-full border-2 border-surface-chat bg-surface-chat"
                  style={{ marginLeft: index === 0 ? 0 : -8 }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              ))}
            </div>
          )}
          {isSearching ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Searching</span>
              {webSearch.query && (
                <span className="truncate text-sm opacity-70">
                  &quot;{webSearch.query}&quot;
                </span>
              )}
              <LoadingDots isThinking={true} isDarkMode={isDarkMode} />
            </div>
          ) : (
            <span className="text-sm leading-5">
              <span className="font-bold">Searched</span>
              {webSearch.query && (
                <span className="font-normal opacity-70">
                  {' '}
                  for &quot;{webSearch.query}&quot;
                </span>
              )}
              {hasSources && (
                <span className="font-normal opacity-70">
                  {' '}
                  · {webSearch.sources!.length} source
                  {webSearch.sources!.length !== 1 ? 's' : ''}
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
                  className="hover:bg-surface-secondary/50 flex flex-col gap-1 rounded-lg px-3 py-2 text-sm text-content-primary transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={getFaviconUrl(source.url)}
                      alt=""
                      className="h-4 w-4 shrink-0"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                    <span className="min-w-0 truncate font-medium">
                      {source.title}
                    </span>
                    {source.publishedDate && (
                      <span className="shrink-0 text-xs opacity-50">
                        {source.publishedDate}
                      </span>
                    )}
                  </div>
                  {source.text && (
                    <p className="line-clamp-2 pl-7 text-xs opacity-70">
                      {source.text}
                    </p>
                  )}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
