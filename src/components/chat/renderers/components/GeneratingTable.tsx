import { LoadingDots } from '@/components/loading-dots'
import { memo } from 'react'

interface GeneratingTableProps {
  isDarkMode: boolean
}

export const GeneratingTable = memo(function GeneratingTable({
  isDarkMode,
}: GeneratingTableProps) {
  return (
    <div className="my-4 flex h-10 items-center gap-2 rounded-lg border border-border-subtle bg-transparent px-4">
      <span className="text-sm font-medium text-content-primary">
        Generating table
      </span>
      <LoadingDots isDarkMode={isDarkMode} />
    </div>
  )
})
