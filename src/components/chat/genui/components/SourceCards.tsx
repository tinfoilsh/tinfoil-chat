import { ImageWithSkeleton } from '@/components/preview/image-with-skeleton'
import { useOpenGraphImage } from '@/components/preview/use-opengraph-image'
import { coerceArray } from './input-coercion'

interface Source {
  title: string
  url: string
  snippet?: string
  publishedAt?: string
  author?: string
  image?: string
}

interface SourceCardsProps {
  sources: unknown
  title?: string
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

function SourceCard({ src }: { src: Source }) {
  const favicon = getFaviconUrl(src.url)
  const domain = getDomain(src.url)
  const image = useOpenGraphImage(src.url, src.image)

  return (
    <a
      href={src.url}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:border-border-primary group flex flex-col gap-2 overflow-hidden rounded-lg border border-border-subtle bg-surface-card transition-colors hover:bg-surface-chat-background"
    >
      {image && (
        <ImageWithSkeleton
          src={image}
          alt=""
          wrapperClassName="relative aspect-[16/9] w-full overflow-hidden bg-surface-card"
          className="h-full w-full object-cover"
          loading="lazy"
        />
      )}
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          {favicon && (
            <ImageWithSkeleton
              src={favicon}
              alt=""
              wrapperClassName="relative h-4 w-4 shrink-0 overflow-hidden rounded bg-surface-card"
              className="h-4 w-4 object-cover"
              loading="lazy"
            />
          )}
          <span className="truncate text-xs text-content-muted">{domain}</span>
        </div>
        <p className="line-clamp-2 text-sm font-medium text-content-primary group-hover:underline">
          {src.title}
        </p>
        {src.snippet && (
          <p className="line-clamp-3 text-xs text-content-muted">
            {src.snippet}
          </p>
        )}
        {(src.publishedAt || src.author) && (
          <div className="mt-auto flex items-center gap-2 text-xs text-content-muted">
            {src.author && <span className="truncate">{src.author}</span>}
            {src.author && src.publishedAt && <span>·</span>}
            {src.publishedAt && <span>{src.publishedAt}</span>}
          </div>
        )}
      </div>
    </a>
  )
}

export function SourceCards({ sources, title }: SourceCardsProps) {
  const items = coerceArray<Source>(sources)
  return (
    <div className="my-3">
      {title && (
        <p className="mb-2 text-sm font-medium text-content-primary">{title}</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((src, i) => (
          <SourceCard key={i} src={src} />
        ))}
      </div>
    </div>
  )
}

export function validateSourceCardsProps(
  props: Record<string, unknown>,
): boolean {
  const sources = coerceArray<unknown>(props.sources)
  return (
    sources.length > 0 &&
    sources.every(
      (s: unknown) =>
        s !== null &&
        typeof s === 'object' &&
        typeof (s as any).title === 'string' &&
        typeof (s as any).url === 'string',
    )
  )
}
