import { ImageWithSkeleton } from '@/components/preview/image-with-skeleton'
import { coerceArray } from './input-coercion'

interface ImageItem {
  url: string
  alt?: string
  caption?: string
  link?: string
}

interface ImageGridProps {
  images: unknown
  title?: string
}

export function ImageGrid({ images, title }: ImageGridProps) {
  const items = coerceArray<ImageItem>(images)
  return (
    <div className="my-3">
      {title && (
        <p className="mb-2 text-sm font-medium text-content-primary">{title}</p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((img, i) => {
          const Wrapper = img.link ? 'a' : 'div'
          const wrapperProps = img.link
            ? {
                href: img.link,
                target: '_blank',
                rel: 'noopener noreferrer',
              }
            : {}
          return (
            <Wrapper
              key={i}
              {...wrapperProps}
              className="group flex flex-col gap-1 overflow-hidden rounded-lg border border-border-subtle bg-surface-card"
            >
              <div className="aspect-square w-full overflow-hidden bg-surface-chat-background">
                <ImageWithSkeleton
                  src={img.url}
                  alt={img.alt ?? ''}
                  wrapperClassName="relative h-full w-full overflow-hidden bg-surface-chat-background"
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              </div>
              {img.caption && (
                <p className="line-clamp-2 px-2 pb-2 text-xs text-content-muted">
                  {img.caption}
                </p>
              )}
            </Wrapper>
          )
        })}
      </div>
    </div>
  )
}

export function validateImageGridProps(
  props: Record<string, unknown>,
): boolean {
  const images = coerceArray<unknown>(props.images)
  return (
    images.length > 0 &&
    images.every(
      (i: unknown) =>
        i !== null &&
        typeof i === 'object' &&
        typeof (i as any).url === 'string',
    )
  )
}
