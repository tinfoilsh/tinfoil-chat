'use client'

import type { ReactNode } from 'react'
import { cn } from './utils'

interface RedactedTextProps {
  active: boolean
  children: ReactNode
  className?: string
}

export function RedactedText({
  active,
  children,
  className,
}: RedactedTextProps) {
  return (
    <span
      className={cn(
        'relative block min-w-0',
        active && 'redacted-text',
        className,
      )}
    >
      <span className="redacted-text-source">{children}</span>
      {active && (
        <span
          aria-hidden="true"
          className="redacted-text-block pointer-events-none absolute inset-x-0"
        />
      )}
    </span>
  )
}
