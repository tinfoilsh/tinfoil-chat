interface KeyValueItem {
  label: string
  value: string | number
}

interface KeyValueListProps {
  items: KeyValueItem[]
  title?: string
}

export function KeyValueList({ items, title }: KeyValueListProps) {
  return (
    <div className="my-3">
      {title && (
        <p className="mb-2 text-sm font-medium text-content-primary">{title}</p>
      )}
      <div className="overflow-hidden rounded-lg border border-border-subtle">
        <dl className="divide-y divide-border-subtle">
          {items.map((item, i) => (
            <div
              key={i}
              className="grid grid-cols-3 gap-4 px-4 py-2.5 sm:grid-cols-4"
            >
              <dt className="col-span-1 text-sm font-medium text-content-muted">
                {item.label}
              </dt>
              <dd className="col-span-2 text-sm text-content-primary sm:col-span-3">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

export function validateKeyValueListProps(
  props: Record<string, unknown>,
): boolean {
  return (
    Array.isArray(props.items) &&
    props.items.every(
      (i: unknown) =>
        i !== null &&
        typeof i === 'object' &&
        typeof (i as any).label === 'string' &&
        (typeof (i as any).value === 'string' ||
          typeof (i as any).value === 'number'),
    )
  )
}
