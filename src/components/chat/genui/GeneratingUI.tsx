import { LoadingDots } from '@/components/loading-dots'
import { memo } from 'react'

export const GeneratingUI = memo(function GeneratingUI() {
  return (
    <div className="my-4 flex h-12 items-center gap-2 rounded-lg border border-border-subtle bg-transparent px-4">
      <span className="text-sm font-medium text-content-primary">
        Generating component
      </span>
      <LoadingDots />
    </div>
  )
})
