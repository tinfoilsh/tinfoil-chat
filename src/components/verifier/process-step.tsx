import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import { StatusIcon } from './status-icon'

type DigestType = 'SOURCE' | 'RUNTIME' | 'CODE_INTEGRITY' | 'GENERIC'

// Utility function to extract measurement value
const extractMeasurement = (data: any): string => {
  if (typeof data === 'string') {
    return data.replace(/^"|"$/g, '');
  }
  if (typeof data === 'object' && data?.measurement) {
    return data.measurement;
  }
  return JSON.stringify(data, null, 2);
}

type ProcessStepProps = {
  title: string
  description: string
  status: 'pending' | 'loading' | 'success' | 'error'
  error?: string
  measurements?: any
  technicalDetails?: string
  links?: Array<{ text: string; url: string }>
  children?: React.ReactNode
  digestType?: DigestType
}

export function ProcessStep({
  title,
  description,
  status,
  error,
  measurements,
  technicalDetails,
  links,
  children,
  digestType,
}: ProcessStepProps) {
  const [isOpen, setIsOpen] = useState(
    status === 'error' || error !== undefined,
  )
  const [showCode, setShowCode] = useState(false)

  useEffect(() => {
    if (status === 'error' || error !== undefined) {
      setIsOpen(true)
    }
  }, [status, error])

  return (
    <div className="w-full rounded-lg border border-gray-800 bg-gray-900 @container">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 text-left"
      >
        <div className="flex flex-row items-center gap-3 md:gap-4">
          <div className="flex items-center">
            <StatusIcon status={status} />
          </div>

          <div className="flex-1 text-center @[400px]:text-left">
            <h3 className="text-sm font-medium text-gray-200">{title}</h3>
            <p className="hidden text-sm text-gray-400 @[400px]:block">
              {description}
            </p>
          </div>

          <div className="rounded-lg p-2 hover:bg-gray-800">
            <ChevronDownIcon
              className={`h-5 w-5 text-gray-400 transition-transform ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="px-4 pb-4">
          <div className="space-y-4">
            <p className="block text-sm text-gray-400 @[400px]:hidden">
              {description}
            </p>
            {children}

            {error && status === 'error' && (
              <div className="flex items-start gap-2 rounded-lg bg-red-500/10 p-3 text-red-400">
                <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <p className="overflow-hidden break-words break-all text-sm">
                  {error}
                </p>
              </div>
            )}

            {measurements && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-gray-200">
                  {digestType === 'SOURCE'
                    ? 'Source Digest'
                    : digestType === 'RUNTIME'
                      ? 'Runtime Digest'
                      : digestType === 'CODE_INTEGRITY'
                        ? 'Code Integrity Digest'
                        : 'Digest'}
                  {digestType === 'SOURCE' && (
                    <span className="block text-xs font-normal text-gray-400">
                      Received from GitHub and Sigstore
                    </span>
                  )}
                  {digestType === 'RUNTIME' && (
                    <span className="block text-xs font-normal text-gray-400">
                      Received from the enclave
                    </span>
                  )}
                  {digestType === 'CODE_INTEGRITY' && (
                    <span className="block text-xs font-normal text-gray-400">
                      Received from the enclave
                    </span>
                  )}
                </h4>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-gray-800 p-4 text-sm text-gray-300">
                  {extractMeasurement(measurements)}
                </pre>
              </div>
            )}

            {technicalDetails && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-gray-200">
                  Technical Details
                </h4>
                <p className="text-sm text-gray-400">{technicalDetails}</p>
              </div>
            )}

            {links && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-gray-200">
                  Related Links
                </h4>
                <ul className="space-y-2">
                  {links.map((link, idx) => (
                    <li key={idx}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-emerald-500 hover:text-emerald-400"
                      >
                        <ChevronRightIcon className="h-4 w-4" />
                        {link.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
