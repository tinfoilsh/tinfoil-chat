'use client'

import { cn } from '@/components/ui/utils'
import { getProjectColor } from '@/constants/project-colors'

interface ProjectModeIndicatorProps {
  projectName: string
  color?: string
}

export function ProjectModeIndicator({
  projectName,
  color,
}: ProjectModeIndicatorProps) {
  const projectColor = getProjectColor(color)

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 z-20 flex h-3 items-center justify-center overflow-hidden px-12 font-aeonik text-[10px] font-medium leading-none md:hidden',
        projectColor
          ? 'text-gray-900'
          : 'bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-white/60',
      )}
      style={projectColor ? { backgroundColor: projectColor.hex } : undefined}
    >
      <span className="truncate">
        You&apos;re working in the{' '}
        <span className="font-bold">{projectName}</span> project
      </span>
    </div>
  )
}
