import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { StatusIcon } from './status-icon'

// Import verification logos
import amdLogo from './assets/amd.svg'
import certLogo from './assets/cert.svg'
import cpuLogo from './assets/cpu.svg'
import gitLogo from './assets/git.svg'
import githubLogo from './assets/github.svg'
import gpuLogo from './assets/gpu.svg'
import nvidiaLogo from './assets/nvidia.svg'
import sigstoreLightLogo from './assets/sigstore-light.svg'
import sigstoreLogo from './assets/sigstore.svg'

type DigestType = 'SOURCE' | 'RUNTIME' | 'CODE_INTEGRITY' | 'GENERIC'

interface MeasurementData {
  measurement?: string
  certificate?: string
}

// Utility function to extract measurement value
const extractMeasurement = (data: MeasurementData | string): string => {
  if (typeof data === 'string') {
    // Check if it's a JSON string that needs parsing
    try {
      const parsed = JSON.parse(data.replace(/^"|"$/g, ''))
      if (
        parsed.registers &&
        Array.isArray(parsed.registers) &&
        parsed.registers.length > 0
      ) {
        return parsed.registers[0]
      }
    } catch {
      // Not JSON, return as is
    }
    return data.replace(/^"|"$/g, '')
  }
  if (typeof data === 'object' && data?.measurement) {
    // Check if measurement contains JSON
    try {
      const parsed = JSON.parse(data.measurement)
      if (
        parsed.registers &&
        Array.isArray(parsed.registers) &&
        parsed.registers.length > 0
      ) {
        return parsed.registers[0]
      }
    } catch {
      // Not JSON, return as is
    }
    return data.measurement
  }
  return JSON.stringify(data, null, 2)
}

// Utility function to extract certificate value
const extractCertificate = (data: MeasurementData | string): string | null => {
  if (typeof data === 'object' && data?.certificate) {
    return data.certificate
  }
  return null
}

type ProcessStepProps = {
  title: string
  description: string
  status: 'pending' | 'loading' | 'success' | 'error'
  error?: string
  measurements?: MeasurementData | string
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

  const isRemoteAttestation =
    title.includes('Enclave Attestation') || digestType === 'RUNTIME'
  const isSourceCodeVerified =
    title.includes('Source Code Verified') || digestType === 'SOURCE'

  return (
    <div
      className={`w-full rounded-lg border ${isDarkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'} @container`}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 text-left"
      >
        <div className="flex flex-row items-center gap-3 md:gap-4">
          <div className="flex items-center">
            <StatusIcon status={status} />
          </div>

          <div className="flex-1 text-center @[400px]:text-left">
            <h3
              className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}
            >
              {title}
            </h3>
            <p
              className={`hidden text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} @[400px]:block`}
            >
              {description}
            </p>
          </div>

          <div
            className={`rounded-lg p-2 ${isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
          >
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
            <p
              className={`block text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} @[400px]:hidden`}
            >
              {description}
            </p>
            {children}

            {error && status === 'error' && (
              <div
                className={`flex items-start gap-2 rounded-lg ${isDarkMode ? 'bg-red-500/10' : 'bg-red-50'} p-3 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}
              >
                <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <p className="break-normal text-sm">{error}</p>
              </div>
            )}

            {measurements && (
              <div>
                <h4
                  className={`mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}
                >
                  {digestType === 'SOURCE'
                    ? 'Source Measurement'
                    : digestType === 'RUNTIME'
                      ? 'Runtime Measurement'
                      : digestType === 'CODE_INTEGRITY'
                        ? 'Source Measurement'
                        : 'Measurement'}
                  {digestType === 'SOURCE' && (
                    <span
                      className={`block text-xs font-normal ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
                    >
                      Received from GitHub and Sigstore.
                    </span>
                  )}
                  {digestType === 'RUNTIME' && (
                    <span
                      className={`block text-xs font-normal ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
                    >
                      Received from the enclave.
                    </span>
                  )}
                  {digestType === 'CODE_INTEGRITY' && (
                    <span
                      className={`block text-xs font-normal ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
                    >
                      Received from the enclave.
                    </span>
                  )}
                </h4>
                <pre
                  className={`overflow-x-auto whitespace-pre-wrap break-all rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'} p-4 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} border ${status === 'success' ? 'border-emerald-500/50' : isDarkMode ? 'border-gray-700' : 'border-gray-300'}`}
                >
                  {extractMeasurement(measurements)}
                  <div className="mt-2 flex items-center justify-end gap-2">
                    {digestType === 'SOURCE' ? (
                      <Image
                        src={gitLogo}
                        alt="Source Code"
                        width={24}
                        height={24}
                        className={`${isDarkMode ? 'invert' : ''} opacity-50`}
                      />
                    ) : (
                      <>
                        <Image
                          src={cpuLogo}
                          alt="CPU"
                          width={24}
                          height={12}
                          className={`${isDarkMode ? 'invert' : ''} opacity-50`}
                        />
                        <span
                          className={`${isDarkMode ? 'text-gray-500' : 'text-gray-400'} text-lg opacity-50`}
                        >
                          +
                        </span>
                        <Image
                          src={gpuLogo}
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

            {measurements && extractCertificate(measurements) && (
              <div>
                <h4
                  className={`mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}
                >
                  TLS Public Key Fingerprint
                  <span
                    className={`block text-xs font-normal ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
                  >
                    Fingerprint of the TLS public key used by the enclave to
                    encrypt the connection.
                  </span>
                </h4>
                <pre
                  className={`overflow-x-auto whitespace-pre-wrap break-all rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'} p-4 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} border ${status === 'success' ? 'border-emerald-500/50' : isDarkMode ? 'border-gray-700' : 'border-gray-300'}`}
                >
                  {extractCertificate(measurements)}
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <Image
                      src={certLogo}
                      alt="Certificate"
                      width={24}
                      height={24}
                      className={`${isDarkMode ? 'invert' : ''} opacity-50`}
                    />
                  </div>
                </pre>
              </div>
            )}

            {isRemoteAttestation && (
              <div className="mt-3">
                <h4
                  className={`mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}
                >
                  Runtime attested by:
                </h4>
                <div className="mt-2 flex items-center space-x-4">
                  <div
                    className={`flex h-12 w-24 flex-col items-center justify-center ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'} rounded-lg p-2`}
                  >
                    <a
                      href="https://docs.nvidia.com/attestation/index.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-full w-full flex-col items-center justify-between"
                    >
                      <div className="flex flex-1 items-center justify-center">
                        <Image
                          src={nvidiaLogo}
                          alt="NVIDIA"
                          width={80}
                          height={24}
                          className={`${!isDarkMode ? 'invert' : ''}`}
                        />
                      </div>
                    </a>
                  </div>
                  <div
                    className={`flex h-12 w-24 flex-col items-center justify-center ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'} rounded-lg p-2`}
                  >
                    <a
                      href="https://www.amd.com/en/developer/sev.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-full w-full flex-col items-center justify-between"
                    >
                      <div className="flex flex-1 items-center justify-center">
                        <Image
                          src={amdLogo}
                          alt="AMD"
                          width={48}
                          height={24}
                          className={isDarkMode ? 'invert' : ''}
                        />
                      </div>
                    </a>
                  </div>
                </div>
              </div>
            )}

            {isSourceCodeVerified && (
              <div className="mt-3">
                <h4
                  className={`mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}
                >
                  Code integrity attested by:
                </h4>
                <div className="mt-2 flex items-center space-x-4">
                  <div
                    className={`flex h-14 w-28 flex-col items-center justify-center ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'} rounded-lg p-2`}
                  >
                    <a
                      href={`https://github.com/${repo}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-full w-full flex-col items-center"
                    >
                      <div className="flex flex-1 items-center justify-center">
                        <Image
                          src={githubLogo}
                          alt="GitHub"
                          width={80}
                          height={24}
                          className={`h-auto max-h-6 w-auto max-w-full ${isDarkMode ? 'invert' : ''}`}
                        />
                      </div>
                      <span
                        className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}
                      >
                        GitHub
                      </span>
                    </a>
                  </div>
                  <div
                    className={`flex h-14 w-28 flex-col items-center justify-center ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'} rounded-lg p-2`}
                  >
                    <a
                      href={`https://search.sigstore.dev/?hash=${githubHash || ''}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-full w-full flex-col items-center"
                    >
                      <div className="flex flex-1 items-center justify-center">
                        <Image
                          src={isDarkMode ? sigstoreLogo : sigstoreLightLogo}
                          alt="Sigstore"
                          width={80}
                          height={24}
                          className="h-auto max-h-6 max-w-full"
                        />
                      </div>
                      <span
                        className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}
                      >
                        Sigstore
                      </span>
                    </a>
                  </div>
                </div>
              </div>
            )}

            {technicalDetails && (
              <div>
                <h4
                  className={`mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}
                >
                  Technical Details
                </h4>
                <p
                  className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
                >
                  {technicalDetails}
                </p>
              </div>
            )}

            {links && (
              <div>
                <h4
                  className={`mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}
                >
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
