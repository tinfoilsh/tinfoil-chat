import { Card } from '@/components/ui/card'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import React, { useMemo } from 'react'
import { coerceArray } from './input-coercion'

interface LeaderboardEntry {
  rank: number | null
  name: string
  score?: number | string
  subtitle?: string
  change?: number
  avatarUrl?: string
  badge?: string
}

interface LeaderboardProps {
  title?: string
  subtitle?: string
  entries?: unknown
  scoreLabel?: string
  scoreSuffix?: string
  highlight?: string
}

function toNumberOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9+\-.eE]/g, ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function normalizeEntries(raw: unknown): LeaderboardEntry[] {
  const list = coerceArray<Record<string, unknown>>(raw)
  const out: LeaderboardEntry[] = []
  list.forEach((entry, index) => {
    const name =
      typeof entry.name === 'string'
        ? entry.name
        : typeof entry.title === 'string'
          ? entry.title
          : ''
    if (!name) return
    const rankCandidate = toNumberOrUndefined(entry.rank)
    out.push({
      rank: rankCandidate ?? index + 1,
      name,
      score:
        typeof entry.score === 'number' || typeof entry.score === 'string'
          ? (entry.score as number | string)
          : undefined,
      subtitle: typeof entry.subtitle === 'string' ? entry.subtitle : undefined,
      change: toNumberOrUndefined(entry.change),
      avatarUrl:
        typeof entry.avatarUrl === 'string'
          ? entry.avatarUrl
          : typeof entry.avatar === 'string'
            ? entry.avatar
            : undefined,
      badge: typeof entry.badge === 'string' ? entry.badge : undefined,
    })
  })
  return out
}

function formatScore(
  value: number | string | undefined,
  suffix?: string,
): string {
  if (value === undefined || value === null || value === '') return '—'
  const numeric =
    typeof value === 'number'
      ? value
      : Number.isFinite(Number(value))
        ? Number(value)
        : null
  const base =
    numeric !== null
      ? new Intl.NumberFormat(undefined, {
          maximumFractionDigits: 2,
        }).format(numeric)
      : String(value)
  return suffix ? `${base} ${suffix}` : base
}

function rankBadgeColor(rank: number): string {
  if (rank === 1) return '#f59e0b'
  if (rank === 2) return '#94a3b8'
  if (rank === 3) return '#b45309'
  return ''
}

function Avatar({
  name,
  avatarUrl,
}: {
  name: string
  avatarUrl?: string
}): React.JSX.Element {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    )
  }
  const initials = name
    .split(/\s+/)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2)
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-chat-background text-xs font-semibold text-content-primary"
    >
      {initials || '·'}
    </span>
  )
}

export function Leaderboard({
  title,
  subtitle,
  entries,
  scoreLabel,
  scoreSuffix,
  highlight,
}: LeaderboardProps): React.JSX.Element {
  const normalizedEntries = useMemo(() => normalizeEntries(entries), [entries])

  if (normalizedEntries.length === 0) {
    return (
      <Card className="my-3 max-w-2xl">
        <div className="p-5 text-sm text-content-muted">No entries.</div>
      </Card>
    )
  }

  return (
    <Card className="my-3 max-w-2xl">
      <div className="flex flex-col gap-3 p-5">
        {(title || subtitle) && (
          <div className="flex flex-col gap-0.5">
            {title && (
              <p className="text-base font-semibold text-content-primary">
                {title}
              </p>
            )}
            {subtitle && (
              <p className="text-xs text-content-muted">{subtitle}</p>
            )}
          </div>
        )}

        <ul className="flex flex-col divide-y divide-border-subtle">
          <li className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 pb-2 text-[10px] font-semibold uppercase tracking-wide text-content-muted">
            <span>#</span>
            <span>Name</span>
            <span className="text-right">{scoreLabel ?? 'Score'}</span>
          </li>
          {normalizedEntries.map((entry, i) => {
            const rank = entry.rank ?? i + 1
            const badgeColor = rankBadgeColor(rank)
            const isHighlighted =
              highlight && entry.name.toLowerCase() === highlight.toLowerCase()
            const changeDirection =
              entry.change === undefined || entry.change === 0
                ? 'flat'
                : entry.change > 0
                  ? 'up'
                  : 'down'
            const ChangeIcon =
              changeDirection === 'up'
                ? ArrowUp
                : changeDirection === 'down'
                  ? ArrowDown
                  : Minus
            const changeColor =
              changeDirection === 'up'
                ? '#16a34a'
                : changeDirection === 'down'
                  ? '#dc2626'
                  : '#6b7280'

            return (
              <li
                key={`${entry.name}-${i}`}
                className={`grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 py-2 ${
                  isHighlighted ? 'rounded-md bg-surface-chat-background' : ''
                }`}
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
                  style={
                    badgeColor
                      ? {
                          backgroundColor: `${badgeColor}22`,
                          color: badgeColor,
                        }
                      : undefined
                  }
                >
                  {rank}
                </span>
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={entry.name} avatarUrl={entry.avatarUrl} />
                  <div className="flex min-w-0 flex-col">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="truncate text-sm font-medium text-content-primary">
                        {entry.name}
                      </span>
                      {entry.badge && (
                        <span className="rounded-md border border-border-subtle px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-content-muted">
                          {entry.badge}
                        </span>
                      )}
                    </div>
                    {entry.subtitle && (
                      <span className="truncate text-xs text-content-muted">
                        {entry.subtitle}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <span className="font-mono text-sm font-semibold tabular-nums text-content-primary">
                    {formatScore(entry.score, scoreSuffix)}
                  </span>
                  {entry.change !== undefined && (
                    <span
                      className="flex items-center gap-0.5 text-[11px] font-medium tabular-nums"
                      style={{ color: changeColor }}
                    >
                      <ChangeIcon className="h-3 w-3" />
                      {changeDirection === 'flat'
                        ? '—'
                        : Math.abs(entry.change)}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </Card>
  )
}

export function validateLeaderboardProps(
  props: Record<string, unknown>,
): boolean {
  const entries = coerceArray(props.entries)
  return entries.length > 0
}
