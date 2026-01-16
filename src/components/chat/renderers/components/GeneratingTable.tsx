import { LoadingDots } from '@/components/loading-dots'
import { memo } from 'react'

export const GeneratingTable = memo(function GeneratingTable() {
  return (
    <div className="my-4 flex h-10 items-center gap-2 rounded-lg border border-border-subtle bg-transparent px-4">
      <span className="text-sm font-medium text-content-primary">
        Generating table
      </span>
      <LoadingDots />
    </div>
  )
})
