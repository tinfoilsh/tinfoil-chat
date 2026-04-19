import { ImageWithSkeleton } from '@/components/preview/image-with-skeleton'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Clock3,
  ExternalLink,
  MapPin,
  Navigation,
  Phone,
  Star,
} from 'lucide-react'
import React from 'react'
import { coerceArray } from './input-coercion'

interface MapPlaceCardProps {
  name: string
  address: string
  description?: string
  image?: string
  category?: string
  rating?: number
  reviewCount?: number
  priceLevel?: string
  openNow?: boolean
  hours?: unknown
  phone?: string
  websiteUrl?: string
  directionsUrl?: string
  sourceUrl?: string
  distance?: string
}

interface ActionLinkProps {
  href: string
  label: string
  icon: typeof ExternalLink
}

function getHours(value: unknown): string[] {
  return coerceArray<unknown>(value).filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  )
}

function ActionLink({ href, label, icon: Icon }: ActionLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-surface-chat-background px-3 py-1.5 text-xs font-medium text-content-primary transition-colors hover:bg-surface-card"
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </a>
  )
}

export function MapPlaceCard({
  name,
  address,
  description,
  image,
  category,
  rating,
  reviewCount,
  priceLevel,
  openNow,
  hours,
  phone,
  websiteUrl,
  directionsUrl,
  sourceUrl,
  distance,
}: MapPlaceCardProps): React.JSX.Element {
  const hourItems = getHours(hours)

  return (
    <Card className="my-3 max-w-2xl overflow-hidden">
      {image && (
        <ImageWithSkeleton
          src={image}
          alt={name}
          wrapperClassName="relative aspect-[16/9] w-full overflow-hidden bg-surface-card"
          className="h-full w-full object-cover"
          loading="lazy"
        />
      )}
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">{name}</CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-content-muted">
              {category && <span>{category}</span>}
              {category && distance && <span>·</span>}
              {distance && <span>{distance}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-content-muted">
            {typeof rating === 'number' && (
              <span className="inline-flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-current text-yellow-500" />
                <span>{rating.toFixed(1)}</span>
              </span>
            )}
            {typeof reviewCount === 'number' && <span>({reviewCount})</span>}
            {priceLevel && <span>{priceLevel}</span>}
            {typeof openNow === 'boolean' && (
              <span
                className={
                  openNow
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }
              >
                {openNow ? 'Open now' : 'Closed'}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {description && (
          <p className="text-sm text-content-primary">{description}</p>
        )}

        <div className="flex gap-2 text-sm text-content-primary">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-content-muted" />
          <p>{address}</p>
        </div>

        {phone && (
          <div className="flex gap-2 text-sm text-content-primary">
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-content-muted" />
            <p>{phone}</p>
          </div>
        )}

        {hourItems.length > 0 && (
          <div className="flex gap-2 text-sm text-content-primary">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-content-muted" />
            <div className="space-y-1">
              {hourItems.map((hoursItem, index) => (
                <p key={index}>{hoursItem}</p>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      {(websiteUrl || directionsUrl || sourceUrl) && (
        <CardFooter className="flex flex-wrap gap-2 border-t border-border-subtle bg-surface-chat-background px-6 py-4">
          {websiteUrl && (
            <ActionLink href={websiteUrl} label="Website" icon={ExternalLink} />
          )}
          {directionsUrl && (
            <ActionLink
              href={directionsUrl}
              label="Directions"
              icon={Navigation}
            />
          )}
          {sourceUrl && (
            <ActionLink href={sourceUrl} label="Source" icon={ExternalLink} />
          )}
        </CardFooter>
      )}
    </Card>
  )
}

export function validateMapPlaceCardProps(
  props: Record<string, unknown>,
): boolean {
  return typeof props.name === 'string' && typeof props.address === 'string'
}
