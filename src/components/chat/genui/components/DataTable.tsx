interface DataTableProps {
  columns: string[]
  rows: Record<string, string | number>[]
  caption?: string
}

export function DataTable({ columns, rows, caption }: DataTableProps) {
  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-border-subtle">
      <table className="w-full divide-y divide-border-subtle">
        {caption && (
          <caption className="bg-surface-secondary px-4 py-2 text-left text-sm font-medium text-content-primary">
            {caption}
          </caption>
        )}
        <thead className="bg-surface-secondary">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-content-primary"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-surface-primary divide-y divide-border-subtle">
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td
                  key={col}
                  className="px-4 py-3 text-sm text-content-primary"
                >
                  {row[col] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function validateDataTableProps(
  props: Record<string, unknown>,
): boolean {
  return (
    Array.isArray(props.columns) &&
    props.columns.every((c: unknown) => typeof c === 'string') &&
    Array.isArray(props.rows) &&
    props.rows.every((r: unknown) => r !== null && typeof r === 'object')
  )
}
