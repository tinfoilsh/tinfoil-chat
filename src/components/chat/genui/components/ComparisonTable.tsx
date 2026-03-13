import { Check, Minus, X } from 'lucide-react'

interface ComparisonTableProps {
  items: string[]
  features: {
    label: string
    values: Array<string | number | boolean | null>
  }[]
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
              {items.map((item) => (
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
            {features.map((feature, i) => (
              <tr key={i}>
                <td className="px-4 py-3 text-sm font-medium text-content-primary">
                  {feature.label}
                </td>
                {items.map((_, j) => (
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
  return (
    Array.isArray(props.items) &&
    props.items.every((i: unknown) => typeof i === 'string') &&
    Array.isArray(props.features) &&
    props.features.every(
      (f: unknown) =>
        f !== null &&
        typeof f === 'object' &&
        typeof (f as any).label === 'string' &&
        Array.isArray((f as any).values),
    )
  )
}
