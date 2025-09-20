'use client'

import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { useId, useState } from 'react'
import { BsDiagram3 } from 'react-icons/bs'

type CollapsibleFlowDiagramProps = {
  children: React.ReactNode
  isDarkMode?: boolean
  isExpanded?: boolean
  onToggle?: () => void
}

export function CollapsibleFlowDiagram({
  children,
  isExpanded: controlledIsExpanded,
  onToggle,
}: CollapsibleFlowDiagramProps) {
  const [internalIsExpanded, setInternalIsExpanded] = useState(false)
  const isExpanded = controlledIsExpanded ?? internalIsExpanded
  const contentId = useId()

  return (
    <div className="w-full rounded-lg border border-border-subtle bg-surface-card @container">
      <button
        type="button"
        onClick={() => {
          if (onToggle) {
            onToggle()
          } else {
            setInternalIsExpanded(!internalIsExpanded)
          }
        }}
        className="w-full p-4 text-left"
        aria-expanded={isExpanded}
        aria-controls={contentId}
      >
        <div className="flex flex-row items-center gap-3 md:gap-4">
          <div className="flex items-center">
            <BsDiagram3 className="h-6 w-6 text-content-secondary" />
          </div>

          <div className="flex-1 text-center @[400px]:text-left">
            <h3 className="text-sm font-medium text-content-primary">
              Verification Flow Diagram
            </h3>
            <p className="hidden text-sm text-content-secondary @[400px]:block">
              Visual representation of the verification process and data flow
            </p>
          </div>

          <div className="rounded-lg p-2 hover:bg-surface-chat/80">
            <ChevronDownIcon
              className={`h-5 w-5 text-content-muted transition-transform ${
                isExpanded ? 'rotate-180' : ''
              }`}
            />
          </div>
        </div>
      </button>

      {isExpanded && (
        <div id={contentId} className="border-t border-border-subtle">
          <div className="rounded-b-lg bg-surface-chat px-4 py-4">
            {children}
          </div>
        </div>
      )}
    </div>
  )
}
