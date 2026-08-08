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
        'pointer-events-none absolute left-4 top-0.5 z-20 flex h-3 max-w-[calc(100%-2rem)] items-center justify-center overflow-hidden rounded-site-base px-3 font-aeonik text-[10px] font-medium leading-none md:hidden',
        projectColor
          ? 'text-gray-900'
          : 'bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-white/60',
      )}
      style={projectColor ? { backgroundColor: projectColor.hex } : undefined}
    >
      <span className="truncate">Project {projectName}</span>
    </div>
  )
}
