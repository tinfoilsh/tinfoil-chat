import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import { StatusIcon } from './status-icon'
import Image from 'next/image'
import { MeasurementDiff } from './measurement-diff'

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
  repo: string
  githubHash?: string
  isDarkMode?: boolean
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
  repo,
  githubHash,
  isDarkMode = true,
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

  const isRemoteAttestation = title.includes('Enclave Attestation') || digestType === 'RUNTIME'
  const isSourceCodeVerified = title.includes('Source Code Verified') || digestType === 'SOURCE'

  return (
    <div className={`w-full rounded-lg border ${isDarkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'} @container`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 text-left"
      >
        <div className="flex flex-row items-center gap-3 md:gap-4">
          <div className="flex items-center">
            <StatusIcon status={status} />
          </div>

          <div className="flex-1 text-center @[400px]:text-left">
            <h3 className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{title}</h3>
            <p className={`hidden text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} @[400px]:block`}>
              {description}
            </p>
          </div>

          <div className={`rounded-lg p-2 ${isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
            <ChevronDownIcon
              className={`h-5 w-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} transition-transform ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="px-4 pb-4">
          <div className="space-y-4">
            <p className={`block text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} @[400px]:hidden`}>
              {description}
            </p>
            {children}

            {error && status === 'error' && (
              <div className={`flex items-start gap-2 rounded-lg ${isDarkMode ? 'bg-red-500/10' : 'bg-red-50'} p-3 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <p className="text-sm break-normal">
                  {error}
                </p>
              </div>
            )}

            {measurements && (
              <div>
                <h4 className={`mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                  {digestType === 'SOURCE'
                    ? 'Source digest (code measurement)'
                    : digestType === 'RUNTIME'
                      ? 'Runtime digest (enclave measurement)'
                      : digestType === 'CODE_INTEGRITY'
                        ? 'Binary digest (code measurement)'
                        : 'Digest'}
                  {digestType === 'SOURCE' && (
                    <span className={`block text-xs font-normal ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Received from GitHub and Sigstore
                    </span>
                  )}
                  {digestType === 'RUNTIME' && (
                    <span className={`block text-xs font-normal ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Received from the enclave
                    </span>
                  )}
                  {digestType === 'CODE_INTEGRITY' && (
                    <span className={`block text-xs font-normal ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Received from the enclave
                    </span>
                  )}
                </h4>
                <pre className={`overflow-x-auto whitespace-pre-wrap break-all rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'} p-4 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} border ${status === 'success' ? 'border-emerald-500/50' : isDarkMode ? 'border-gray-700' : 'border-gray-300'}`}>
                  {extractMeasurement(measurements)}
                  <div className="flex justify-end mt-2 items-center gap-2">
                    {digestType === 'SOURCE' ? (
                      <Image 
                        src="/verification-logos/git.svg" 
                        alt="Source Code" 
                        width={24}
                        height={24}
                        className={`${isDarkMode ? 'invert' : ''} opacity-50`}
                      />
                    ) : (
                      <>
                        <Image 
                          src="/verification-logos/cpu.svg" 
                          alt="CPU" 
                          width={24}
                          height={12}
                          className={`${isDarkMode ? 'invert' : ''} opacity-50`}
                        />
                        <span className={`${isDarkMode ? 'text-gray-500' : 'text-gray-400'} opacity-50 text-lg`}>+</span>
                        <Image 
                          src="/verification-logos/gpu.svg" 
                          alt="GPU" 
                          width={32}
                          height={16}
                          className={`${isDarkMode ? 'invert' : ''} opacity-50`}
                        />
                      </>
                    )}
                  </div>
                </pre>
              </div>
            )}

            {isRemoteAttestation && (
              <div className="mt-3">
                <h4 className={`mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                  Runtime attested by: 
                </h4>
                <div className="flex items-center space-x-4 mt-2">
                  <div className={`w-24 h-12 flex flex-col items-center justify-center ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'} rounded-lg p-2`}>
                    <a 
                      href="https://docs.nvidia.com/attestation/index.html" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="flex flex-col items-center h-full w-full justify-between"
                    >
                      <div className="flex items-center justify-center flex-1">
                        <Image 
                          src="/verification-logos/nvidia.svg" 
                          alt="NVIDIA" 
                          width={80}
                          height={24}
                          className={`${!isDarkMode ? 'invert' : ''}`}
                        />
                      </div>
                    </a>
                  </div>
                  <div className={`w-24 h-12 flex flex-col items-center justify-center ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'} rounded-lg p-2`}>
                    <a 
                      href="https://www.amd.com/en/technologies/infinity-guard" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="flex flex-col items-center h-full w-full justify-between"
                    >
                      <div className="flex items-center justify-center flex-1">
                        <Image 
                          src="/verification-logos/amd.svg" 
                          alt="AMD" 
                          width={48}
                          height={24}
                          className={isDarkMode ? "invert" : ""}
                        />
                      </div>
                    </a>
                  </div>
                </div>
              </div>
            )}

            {isSourceCodeVerified && (
              <div className="mt-3">
                <h4 className={`mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                  Code integrity attested by: 
                </h4>
                <div className="flex items-center space-x-4 mt-2">
                  <div className={`w-28 h-14 flex flex-col items-center justify-center ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'} rounded-lg p-2`}>
                    <a 
                      href={`https://github.com/${repo}`}
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="flex flex-col items-center h-full w-full"
                    >
                      <div className="flex items-center justify-center flex-1">
                        <Image 
                          src="/verification-logos/github.svg" 
                          alt="GitHub" 
                          width={80}
                          height={24}
                          className={`w-auto h-auto max-h-6 max-w-full ${isDarkMode ? 'invert' : ''}`}
                        />
                      </div>
                      <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>GitHub</span>
                    </a>
                  </div>
                  <div className={`w-28 h-14 flex flex-col items-center justify-center ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'} rounded-lg p-2`}>
                    <a 
                      href={`https://search.sigstore.dev/?hash=${githubHash || ''}`}
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="flex flex-col items-center h-full w-full"
                    >
                      <div className="flex items-center justify-center flex-1">
                        <Image 
                          src={isDarkMode ? "/verification-logos/sigstore.svg" : "/verification-logos/sigstore-light.svg"}
                          alt="Sigstore" 
                          width={80}
                          height={24}
                          className="h-auto max-h-6 max-w-full"
                        />
                      </div>
                      <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>Sigstore</span>
                    </a>
                  </div>
                </div>
              </div>
            )}

            {technicalDetails && (
              <div>
                <h4 className={`mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                  Technical Details
                </h4>
                <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{technicalDetails}</p>
              </div>
            )}

            {links && (
              <div>
                <h4 className={`mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
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
