import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Sun,
  Wind,
} from 'lucide-react'
import React from 'react'
import { coerceArray } from './input-coercion'

type WeatherValue = string | number

interface ForecastItem {
  label: string
  condition?: string
  temperature?: WeatherValue
  high?: WeatherValue
  low?: WeatherValue
  precipitationChance?: WeatherValue
}

interface WeatherCardProps {
  location: string
  condition: string
  temperature: WeatherValue
  unit?: 'C' | 'F'
  feelsLike?: WeatherValue
  high?: WeatherValue
  low?: WeatherValue
  precipitationChance?: WeatherValue
  humidity?: WeatherValue
  wind?: string
  forecast?: unknown
  updatedAt?: string
}

function getForecastItems(value: unknown): ForecastItem[] {
  return coerceArray<ForecastItem>(value)
}

function formatTemperature(value: WeatherValue | undefined, unit?: 'C' | 'F') {
  if (value === undefined) return null
  if (typeof value === 'number') return `${value}°${unit ?? ''}`
  return value
}

function formatPercent(value: WeatherValue | undefined) {
  if (value === undefined) return null
  if (typeof value === 'number') return `${value}%`
  return value
}

function getConditionIcon(condition: string) {
  const normalized = condition.toLowerCase()

  if (normalized.includes('storm') || normalized.includes('thunder')) {
    return CloudLightning
  }
  if (normalized.includes('snow') || normalized.includes('sleet')) {
    return CloudSnow
  }
  if (normalized.includes('rain') || normalized.includes('shower')) {
    return CloudRain
  }
  if (normalized.includes('fog') || normalized.includes('mist')) {
    return CloudFog
  }
  if (normalized.includes('partly') || normalized.includes('sun')) {
    return CloudSun
  }
  if (normalized.includes('clear')) {
    return Sun
  }
  return Cloud
}

export function WeatherCard({
  location,
  condition,
  temperature,
  unit,
  feelsLike,
  high,
  low,
  precipitationChance,
  humidity,
  wind,
  forecast,
  updatedAt,
}: WeatherCardProps): React.JSX.Element {
  const forecastItems = getForecastItems(forecast)
  const ConditionIcon = getConditionIcon(condition)
  const stats = [
    { label: 'Feels like', value: formatTemperature(feelsLike, unit) },
    {
      label: 'High / low',
      value:
        high !== undefined || low !== undefined
          ? `${formatTemperature(high, unit) ?? '—'} / ${formatTemperature(low, unit) ?? '—'}`
          : null,
    },
    {
      label: 'Precipitation',
      value: formatPercent(precipitationChance),
      icon: Droplets,
    },
    { label: 'Humidity', value: formatPercent(humidity), icon: Droplets },
    { label: 'Wind', value: wind, icon: Wind },
  ].filter(
    (
      item,
    ): item is {
      label: string
      value: string
      icon?: typeof Droplets
    } => typeof item.value === 'string' && item.value.length > 0,
  )

  return (
    <Card className="my-3 max-w-3xl">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{location}</CardTitle>
            <p className="mt-1 text-sm text-content-muted">{condition}</p>
          </div>
          {updatedAt && (
            <p className="text-xs text-content-muted">Updated {updatedAt}</p>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="rounded-full bg-surface-chat-background p-3">
            <ConditionIcon className="h-8 w-8 text-content-primary" />
          </div>
          <div>
            <p className="text-3xl font-semibold text-content-primary">
              {formatTemperature(temperature, unit)}
            </p>
            <p className="text-sm text-content-muted">{condition}</p>
          </div>
        </div>

        {stats.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stats.map((stat) => {
              const Icon = stat.icon

              return (
                <div
                  key={stat.label}
                  className="rounded-lg border border-border-subtle bg-surface-chat-background px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    {Icon && <Icon className="h-4 w-4 text-content-muted" />}
                    <span className="text-xs text-content-muted">
                      {stat.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-content-primary">
                    {stat.value}
                  </p>
                </div>
              )
            })}
          </div>
        )}

        {forecastItems.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-content-primary">
              Forecast
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {forecastItems.map((item, index) => {
                const ForecastIcon = getConditionIcon(
                  item.condition ?? condition,
                )
                const forecastTemperature =
                  item.temperature !== undefined
                    ? formatTemperature(item.temperature, unit)
                    : null
                const forecastRange =
                  item.high !== undefined || item.low !== undefined
                    ? `${formatTemperature(item.high, unit) ?? '—'} / ${formatTemperature(item.low, unit) ?? '—'}`
                    : null
                const forecastPrecipitation = formatPercent(
                  item.precipitationChance,
                )

                return (
                  <div
                    key={`${item.label}-${index}`}
                    className="rounded-lg border border-border-subtle bg-surface-chat-background px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-content-primary">
                        {item.label}
                      </p>
                      <ForecastIcon className="h-4 w-4 text-content-muted" />
                    </div>
                    {item.condition && (
                      <p className="mt-1 text-xs text-content-muted">
                        {item.condition}
                      </p>
                    )}
                    {forecastTemperature && (
                      <p className="mt-2 text-sm font-semibold text-content-primary">
                        {forecastTemperature}
                      </p>
                    )}
                    {forecastRange && (
                      <p className="mt-1 text-xs text-content-muted">
                        {forecastRange}
                      </p>
                    )}
                    {forecastPrecipitation && (
                      <p className="mt-1 text-xs text-content-muted">
                        {forecastPrecipitation} precip.
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function validateWeatherCardProps(
  props: Record<string, unknown>,
): boolean {
  return (
    typeof props.location === 'string' &&
    typeof props.condition === 'string' &&
    (typeof props.temperature === 'string' ||
      typeof props.temperature === 'number')
  )
}
