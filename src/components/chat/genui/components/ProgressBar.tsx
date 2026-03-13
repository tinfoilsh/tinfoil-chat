import { Progress } from '@/components/ui/progress'

interface ProgressBarProps {
  label: string
  value: number
  max?: number
}

export function ProgressBar({ label, value, max = 100 }: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div className="my-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-content-primary">
          {label}
        </span>
        <span className="text-sm text-content-muted">
          {value}/{max}
        </span>
      </div>
      <Progress value={percentage} />
    </div>
  )
}

export function validateProgressBarProps(
  props: Record<string, unknown>,
): boolean {
  return typeof props.label === 'string' && typeof props.value === 'number'
}
