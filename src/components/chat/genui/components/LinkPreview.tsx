import { ExternalLink } from 'lucide-react'

interface LinkPreviewProps {
  url: string
  title: string
  description?: string
  image?: string
  siteName?: string
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function getFaviconUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname
    return `https://icons.duckduckgo.com/ip3/${host}.ico`
  } catch {
    return null
  }
}

export function LinkPreview({
  url,
  title,
  description,
  image,
  siteName,
}: LinkPreviewProps) {
  const favicon = getFaviconUrl(url)
  const displayName = siteName || getDomain(url)

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:border-border-primary my-3 flex max-w-2xl overflow-hidden rounded-lg border border-border-subtle bg-surface-card transition-colors hover:bg-surface-chat-background"
    >
      {image && (
        <img
          src={image}
          alt=""
          className="h-32 w-32 shrink-0 object-cover sm:h-40 sm:w-40"
          loading="lazy"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-1 p-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            {favicon && (
              <img
                src={favicon}
                alt=""
                className="h-4 w-4 shrink-0 rounded"
                loading="lazy"
              />
            )}
            <span className="truncate text-xs text-content-muted">
              {displayName}
            </span>
          </div>
          <p className="line-clamp-2 text-sm font-semibold text-content-primary">
            {title}
          </p>
          {description && (
            <p className="mt-1 line-clamp-2 text-xs text-content-muted">
              {description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-content-muted">
          <span className="truncate">{getDomain(url)}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </div>
      </div>
    </a>
  )
}

export function validateLinkPreviewProps(
  props: Record<string, unknown>,
): boolean {
  return typeof props.url === 'string' && typeof props.title === 'string'
}
