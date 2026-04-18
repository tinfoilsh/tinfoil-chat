import { Check, Minus, X } from 'lucide-react'
import { coerceArray } from './input-coercion'

interface Feature {
  label: string
  values: Array<string | number | boolean | null>
}

interface ComparisonTableProps {
  items: unknown
  features: unknown
  title?: string
}

function renderCell(value: string | number | boolean | null) {
  if (value === true) {
    return <Check className="mx-auto h-4 w-4 text-green-500" />
  }
  if (value === false) {
    return <X className="mx-auto h-4 w-4 text-red-500" />
  }
  if (value === null || value === undefined || value === '') {
    return <Minus className="mx-auto h-4 w-4 text-content-muted" />
  }
  return <span>{String(value)}</span>
}

export function ComparisonTable({
  items,
  features,
  title,
}: ComparisonTableProps) {
  const columns = coerceArray<string>(items)
  const rows = coerceArray<Feature>(features).map((f) => ({
    label: f.label,
    values: coerceArray<string | number | boolean | null>(f.values),
  }))
  return (
    <div className="my-3">
      {title && (
        <p className="mb-2 text-sm font-medium text-content-primary">{title}</p>
      )}
      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        <table className="w-full divide-y divide-border-subtle">
          <thead className="bg-surface-chat-background">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-content-muted">
                Feature
              </th>
              {columns.map((item) => (
                <th
                  key={item}
                  className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-content-primary"
                >
                  {item}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {rows.map((feature, i) => (
              <tr key={i}>
                <td className="px-4 py-3 text-sm font-medium text-content-primary">
                  {feature.label}
                </td>
                {columns.map((_, j) => (
                  <td
                    key={j}
                    className="px-4 py-3 text-center text-sm text-content-primary"
                  >
                    {renderCell(feature.values[j] ?? null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function validateComparisonTableProps(
  props: Record<string, unknown>,
): boolean {
  const items = coerceArray<unknown>(props.items)
  const features = coerceArray<unknown>(props.features)
  return (
    items.length > 0 &&
    items.every((i: unknown) => typeof i === 'string') &&
    features.length > 0 &&
    features.every(
      (f: unknown) =>
        f !== null &&
        typeof f === 'object' &&
        typeof (f as any).label === 'string' &&
        coerceArray((f as any).values).length >= 0,
    )
  )
}
