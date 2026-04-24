import { Card } from '@/components/ui/card'
import { ExternalLink, MapPin, Navigation } from 'lucide-react'
import React, { useMemo } from 'react'
import { coerceArray } from './input-coercion'

interface PlaceInput {
  name: string
  address?: string
  lat?: number
  lng?: number
  description?: string
}

interface PlacesMapProps {
  places?: unknown
  mode?: 'search' | 'directions'
  origin?: PlaceInput
  destination?: PlaceInput
  title?: string
  footer?: string
}

const MAP_VIEWBOX_SIZE = 400
const MAP_PADDING = 40
const APPLE_PIN_COLOR = '#ef4444'
const ORIGIN_PIN_COLOR = '#10b981'
const DESTINATION_PIN_COLOR = '#ef4444'

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizePlace(raw: unknown): PlaceInput | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Record<string, unknown>
  const name = typeof entry.name === 'string' ? entry.name : ''
  if (!name) return null
  const address = typeof entry.address === 'string' ? entry.address : undefined
  const description =
    typeof entry.description === 'string' ? entry.description : undefined
  const lat = isFiniteNumber(entry.lat)
    ? entry.lat
    : isFiniteNumber(entry.latitude)
      ? entry.latitude
      : undefined
  const lng = isFiniteNumber(entry.lng)
    ? entry.lng
    : isFiniteNumber(entry.lon)
      ? entry.lon
      : isFiniteNumber(entry.longitude)
        ? entry.longitude
        : undefined
  return { name, address, description, lat, lng }
}

function normalizePlaces(raw: unknown): PlaceInput[] {
  const list = coerceArray<unknown>(raw)
  const out: PlaceInput[] = []
  for (const item of list) {
    const place = normalizePlace(item)
    if (place) out.push(place)
  }
  return out
}

function placeQueryString(place: PlaceInput): string {
  if (isFiniteNumber(place.lat) && isFiniteNumber(place.lng)) {
    return `${place.lat},${place.lng}`
  }
  const parts = [place.name, place.address].filter(Boolean)
  return parts.join(', ')
}

function appleMapsUrl(
  places: PlaceInput[],
  mode: 'search' | 'directions',
  origin?: PlaceInput,
  destination?: PlaceInput,
): string {
  const base = 'https://maps.apple.com/?'
  if (mode === 'directions' && origin && destination) {
    const params = new URLSearchParams({
      saddr: placeQueryString(origin),
      daddr: placeQueryString(destination),
    })
    return `${base}${params.toString()}`
  }
  const target = places[0]
  if (!target) return 'https://maps.apple.com/'
  if (isFiniteNumber(target.lat) && isFiniteNumber(target.lng)) {
    const params = new URLSearchParams({
      ll: `${target.lat},${target.lng}`,
      q: target.name,
    })
    return `${base}${params.toString()}`
  }
  const params = new URLSearchParams({ q: placeQueryString(target) })
  return `${base}${params.toString()}`
}

function googleMapsUrl(
  places: PlaceInput[],
  mode: 'search' | 'directions',
  origin?: PlaceInput,
  destination?: PlaceInput,
): string {
  if (mode === 'directions' && origin && destination) {
    const params = new URLSearchParams({
      api: '1',
      origin: placeQueryString(origin),
      destination: placeQueryString(destination),
    })
    return `https://www.google.com/maps/dir/?${params.toString()}`
  }
  const target = places[0]
  if (!target) return 'https://www.google.com/maps'
  const params = new URLSearchParams({
    api: '1',
    query: placeQueryString(target),
  })
  return `https://www.google.com/maps/search/?${params.toString()}`
}

function wazeUrl(
  places: PlaceInput[],
  mode: 'search' | 'directions',
  destination?: PlaceInput,
): string {
  const target = mode === 'directions' ? destination : places[0]
  if (!target) return 'https://www.waze.com/'
  if (isFiniteNumber(target.lat) && isFiniteNumber(target.lng)) {
    const params = new URLSearchParams({
      ll: `${target.lat},${target.lng}`,
      navigate: 'yes',
    })
    return `https://www.waze.com/ul?${params.toString()}`
  }
  const params = new URLSearchParams({
    q: placeQueryString(target),
    navigate: 'yes',
  })
  return `https://www.waze.com/ul?${params.toString()}`
}

interface ProjectedPin {
  x: number
  y: number
  place: PlaceInput
  role: 'origin' | 'destination' | 'place'
  index: number
}

function projectPins(
  pins: Array<{ place: PlaceInput; role: ProjectedPin['role'] }>,
): ProjectedPin[] {
  const withCoords = pins.filter(
    (p) => isFiniteNumber(p.place.lat) && isFiniteNumber(p.place.lng),
  )

  if (withCoords.length === 0) return []

  const lats = withCoords.map((p) => p.place.lat as number)
  const lngs = withCoords.map((p) => p.place.lng as number)

  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)

  const latRange = Math.max(maxLat - minLat, 0.001)
  const lngRange = Math.max(maxLng - minLng, 0.001)
  const range = Math.max(latRange, lngRange)

  const centerLat = (minLat + maxLat) / 2
  const centerLng = (minLng + maxLng) / 2

  const plotSize = MAP_VIEWBOX_SIZE - MAP_PADDING * 2

  return withCoords.map((p, index) => {
    const lat = p.place.lat as number
    const lng = p.place.lng as number
    const normalizedX = (lng - centerLng) / range + 0.5
    const normalizedY = 1 - ((lat - centerLat) / range + 0.5)
    return {
      x: MAP_PADDING + normalizedX * plotSize,
      y: MAP_PADDING + normalizedY * plotSize,
      place: p.place,
      role: p.role,
      index,
    }
  })
}

function MapSketch({ pins }: { pins: ProjectedPin[] }): React.JSX.Element {
  const showRoute =
    pins.length === 2 &&
    pins.some((p) => p.role === 'origin') &&
    pins.some((p) => p.role === 'destination')

  return (
    <svg
      viewBox={`0 0 ${MAP_VIEWBOX_SIZE} ${MAP_VIEWBOX_SIZE}`}
      role="img"
      aria-label="Map overview"
      className="h-48 w-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern
          id="map-grid"
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 40 0 L 0 0 0 40"
            fill="none"
            stroke="hsl(var(--border-subtle))"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect
        width={MAP_VIEWBOX_SIZE}
        height={MAP_VIEWBOX_SIZE}
        fill="hsl(var(--surface-chat-background))"
      />
      <rect
        width={MAP_VIEWBOX_SIZE}
        height={MAP_VIEWBOX_SIZE}
        fill="url(#map-grid)"
      />

      {showRoute &&
        (() => {
          const origin = pins.find((p) => p.role === 'origin')
          const dest = pins.find((p) => p.role === 'destination')
          if (!origin || !dest) return null
          return (
            <line
              x1={origin.x}
              y1={origin.y}
              x2={dest.x}
              y2={dest.y}
              stroke="#3b82f6"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="6 6"
            />
          )
        })()}

      {pins.map((pin, i) => {
        const color =
          pin.role === 'origin'
            ? ORIGIN_PIN_COLOR
            : pin.role === 'destination'
              ? DESTINATION_PIN_COLOR
              : APPLE_PIN_COLOR
        return (
          <g
            key={`${pin.place.name}-${i}`}
            transform={`translate(${pin.x} ${pin.y})`}
          >
            <circle r="14" fill={color} fillOpacity="0.2" />
            <circle r="8" fill={color} stroke="#ffffff" strokeWidth="2" />
            <text
              y="-14"
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill="hsl(var(--content-primary))"
            >
              {pin.place.name.length > 22
                ? `${pin.place.name.slice(0, 20)}…`
                : pin.place.name}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function ActionButton({
  href,
  label,
  icon: Icon,
}: {
  href: string
  label: string
  icon: typeof ExternalLink
}): React.JSX.Element {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface-chat-background px-3 py-1.5 text-xs font-medium text-content-primary transition-colors hover:bg-surface-card"
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </a>
  )
}

export function PlacesMap({
  places,
  mode,
  origin,
  destination,
  title,
  footer,
}: PlacesMapProps): React.JSX.Element {
  const normalizedPlaces = useMemo(() => normalizePlaces(places), [places])
  const normalizedOrigin = useMemo(
    () => (origin ? (normalizePlace(origin) ?? undefined) : undefined),
    [origin],
  )
  const normalizedDestination = useMemo(
    () =>
      destination ? (normalizePlace(destination) ?? undefined) : undefined,
    [destination],
  )

  const effectiveMode: 'search' | 'directions' =
    mode === 'directions' ||
    (normalizedOrigin && normalizedDestination && !mode)
      ? 'directions'
      : 'search'

  const pinsForMap = useMemo(() => {
    if (
      effectiveMode === 'directions' &&
      normalizedOrigin &&
      normalizedDestination
    ) {
      return projectPins([
        { place: normalizedOrigin, role: 'origin' },
        { place: normalizedDestination, role: 'destination' },
      ])
    }
    return projectPins(
      normalizedPlaces.map((place) => ({ place, role: 'place' })),
    )
  }, [effectiveMode, normalizedOrigin, normalizedDestination, normalizedPlaces])

  const placesForLinks =
    effectiveMode === 'directions' && normalizedDestination
      ? [normalizedDestination]
      : normalizedPlaces

  const appleUrl = appleMapsUrl(
    placesForLinks,
    effectiveMode,
    normalizedOrigin,
    normalizedDestination,
  )
  const googleUrl = googleMapsUrl(
    placesForLinks,
    effectiveMode,
    normalizedOrigin,
    normalizedDestination,
  )
  const waze = wazeUrl(placesForLinks, effectiveMode, normalizedDestination)

  const listedPlaces =
    effectiveMode === 'directions' && normalizedOrigin && normalizedDestination
      ? [normalizedOrigin, normalizedDestination]
      : normalizedPlaces

  if (listedPlaces.length === 0) {
    return (
      <Card className="my-3 max-w-2xl">
        <div className="p-5 text-sm text-content-muted">
          No places to display.
        </div>
      </Card>
    )
  }

  return (
    <Card className="my-3 max-w-2xl overflow-hidden">
      <div className="flex flex-col">
        {(title || effectiveMode === 'directions') && (
          <div className="flex items-center justify-between gap-2 px-5 pt-4">
            <p className="text-sm font-medium text-content-primary">
              {title ??
                (effectiveMode === 'directions' ? 'Directions' : 'Places')}
            </p>
            {effectiveMode === 'directions' && (
              <span className="rounded-md border border-border-subtle px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-content-muted">
                Route
              </span>
            )}
          </div>
        )}

        {pinsForMap.length > 0 && (
          <div className="mt-3 border-y border-border-subtle">
            <MapSketch pins={pinsForMap} />
          </div>
        )}

        <div className="flex flex-col gap-3 p-5">
          <ul className="flex flex-col gap-2">
            {listedPlaces.map((place, i) => {
              const isOrigin =
                effectiveMode === 'directions' && place === normalizedOrigin
              const isDestination =
                effectiveMode === 'directions' &&
                place === normalizedDestination
              const color = isOrigin
                ? ORIGIN_PIN_COLOR
                : isDestination
                  ? DESTINATION_PIN_COLOR
                  : APPLE_PIN_COLOR
              const roleLabel = isOrigin ? 'From' : isDestination ? 'To' : null
              return (
                <li
                  key={`${place.name}-${i}`}
                  className="flex items-start gap-3"
                >
                  <span
                    aria-hidden="true"
                    className="mt-1 inline-flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: color }}
                  >
                    <span className="block h-1.5 w-1.5 rounded-full bg-white" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      {roleLabel && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-content-muted">
                          {roleLabel}
                        </span>
                      )}
                      <span className="text-sm font-medium text-content-primary">
                        {place.name}
                      </span>
                    </div>
                    {place.address && (
                      <span className="text-xs text-content-muted">
                        {place.address}
                      </span>
                    )}
                    {place.description && (
                      <span className="mt-1 text-xs text-content-muted">
                        {place.description}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="flex flex-wrap gap-2 pt-1">
            <ActionButton
              href={appleUrl}
              label={
                effectiveMode === 'directions'
                  ? 'Directions in Apple Maps'
                  : 'Open in Apple Maps'
              }
              icon={MapPin}
            />
            <ActionButton
              href={googleUrl}
              label={
                effectiveMode === 'directions'
                  ? 'Directions in Google Maps'
                  : 'Open in Google Maps'
              }
              icon={ExternalLink}
            />
            <ActionButton
              href={waze}
              label={
                effectiveMode === 'directions'
                  ? 'Navigate with Waze'
                  : 'Open in Waze'
              }
              icon={Navigation}
            />
          </div>

          {footer && (
            <p className="pt-1 text-xs text-content-muted">{footer}</p>
          )}
        </div>
      </div>
    </Card>
  )
}

export function validatePlacesMapProps(
  props: Record<string, unknown>,
): boolean {
  const mode =
    props.mode === 'directions' ||
    props.mode === 'search' ||
    props.mode === undefined
  if (!mode) return false
  const places = coerceArray(props.places)
  const hasOriginAndDestination =
    !!props.origin &&
    typeof props.origin === 'object' &&
    !!props.destination &&
    typeof props.destination === 'object'
  return places.length > 0 || hasOriginAndDestination
}
