'use client'

import { cn } from '@/components/ui/utils'
import { FolderIcon } from '@heroicons/react/24/outline'

interface ProjectModeBannerProps {
  projectName: string
  isDarkMode: boolean
}

export function ProjectModeBanner({
  projectName,
  isDarkMode,
}: ProjectModeBannerProps) {
  return (
    <div className="pointer-events-none relative z-10 flex w-full flex-none justify-center">
      <div
        className={cn(
          'pointer-events-auto flex items-center gap-2 rounded-b-xl border-x border-b px-4 py-1.5 transition-colors',
          isDarkMode
            ? 'border-white/10 bg-white/5 text-white/60'
            : 'border-gray-200 bg-gray-50 text-gray-500',
        )}
      >
        <FolderIcon className="h-3.5 w-3.5" />
        <span className="font-aeonik text-xs font-medium">
          You&apos;re working in the{' '}
          <span className="font-bold">{projectName}</span> project
        </span>
      </div>
    </div>
  )
}
