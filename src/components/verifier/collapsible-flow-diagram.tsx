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
  isDarkMode = false,
  isExpanded: controlledIsExpanded,
  onToggle,
}: CollapsibleFlowDiagramProps) {
  const [internalIsExpanded, setInternalIsExpanded] = useState(false)
  const isExpanded = controlledIsExpanded ?? internalIsExpanded
  const contentId = useId()

  return (
    <div
      className={`w-full rounded-lg border ${
        isDarkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'
      } @container`}
    >
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
            <BsDiagram3
              className={`h-6 w-6 ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              }`}
            />
          </div>

          <div className="flex-1 text-center @[400px]:text-left">
            <h3
              className={`text-sm font-medium ${
                isDarkMode ? 'text-gray-200' : 'text-gray-800'
              }`}
            >
              Verification Flow Diagram
            </h3>
            <p
              className={`hidden text-sm ${
                isDarkMode ? 'text-gray-400' : 'text-gray-600'
              } @[400px]:block`}
            >
              Visual representation of the verification process and data flow
            </p>
          </div>

          <div
            className={`rounded-lg p-2 ${
              isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
            }`}
          >
            <ChevronDownIcon
              className={`h-5 w-5 ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              } transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            />
          </div>
        </div>
      </button>

      {isExpanded && (
        <div
          id={contentId}
          className={`border-t ${
            isDarkMode ? 'border-gray-800' : 'border-gray-200'
          }`}
        >
          <div
            className={`rounded-b-lg py-4 ${
              isDarkMode ? 'bg-gray-800/50' : 'bg-gray-50'
            }`}
          >
            {children}
          </div>
        </div>
      )}
    </div>
  )
}
