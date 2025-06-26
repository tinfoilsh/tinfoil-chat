import { ChevronRightIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import { useCallback, useEffect, useState } from 'react'
// Import WASM Go runtime - provides the Go WebAssembly runtime needed to execute 
// the enclave verification functions written in Go
import './wasm_exec.js'
import { VERIFIER_CONSTANTS } from './constants'
import { MeasurementDiff } from './measurement-diff'
import { ProcessStep } from './process-step'
import VerificationStatus from './verification-status'

/**
 * VERIFIER COMPONENT OVERVIEW
 * ==========================
 * 
 * This component performs three critical security verifications:
 * 
 * 1. REMOTE ATTESTATION (Enclave Verification): 
 *    - Fetches attestation from the secure enclave 
 *    - Validates signatures from hardware manufacturers (NVIDIA/AMD)
 *    - Extracts the measurement (hash) of code currently running in the enclave
 * 
 * 2. CODE INTEGRITY (Source Code Verification):
 *    - Fetches the latest release hash from GitHub
 *    - Retrieves measurement from Sigstore transparency log 
 *    - Verifies that GitHub Actions properly built and signed the code
 * 
 * 3. CODE CONSISTENCY (Security Verification):
 *    - Compares the enclave measurement with the GitHub Actions/Sigstore measurement
 *    - Ensures the code running in the enclave matches the published and verified source
 *    - Prevents supply chain attacks by confirming code consistency
 * 
 * VERIFICATION MODE:
 * This component implements "audit-time verification" - verifying enclave integrity 
 * out-of-band rather than during the actual connection. This approach relies on 
 * attestation transparency and certificate transparency logs to create an immutable 
 * audit trail. Learn more: https://docs.tinfoil.sh/verification/comparison
 * 
 * All verification runs client-side using WebAssembly compiled from Go source code.
 * 
 * WASM Implementation:
 * - Go source: https://github.com/tinfoilsh/verifier-go
 * - WASM build: https://github.com/tinfoilsh/verifier-js
 * 
 * This ensures no third-party services can interfere with the verification process.
 * 
 * PROXY USAGE AND SECURITY:
 * The verifier uses proxies for external services to prevent rate limiting:
 * 
 * 1. GitHub Proxy (github-proxy.tinfoil.sh): Used to fetch release data without hitting
 *    GitHub's rate limits. This doesn't compromise security because the fetched data
 *    is verified through Sigstore's transparency logs.
 * 
 * 2. AMD KDS Proxy (kds-proxy.tinfoil.sh): Used to fetch AMD attestation certificates.
 *    This proxy is safe to use because the root AMD Genoa CPU certificate is embedded
 *    in the verifier code and validates the entire certificate chain, preventing any
 *    possibility of forged attestations. The proxy simply caches AMD's responses to
 *    prevent rate limiting. Users can optionally modify the verifier source to use
 *    AMD's server directly (kdsintf.amd.com) if desired.
 */

// TypeScript interface for the Go WebAssembly runtime
interface GoInterface {
  run(instance: WebAssembly.Instance): void
  importObject: WebAssembly.Imports
}

// Global functions provided by the WASM module after loading
// Implementation details: https://github.com/tinfoilsh/verifier-go
declare global {
  interface Window {
    Go: new () => GoInterface
    // Performs enclave verification - validates attestation and extracts measurement
    verifyEnclave(enclaveHostname: string): Promise<{
      certificate: string
      measurement: string
    }>
    // Performs source code verification using GitHub Actions and Sigstore
    // Returns the measurement from the verified build process
    verifyCode(repo: string, digest: string): Promise<string>
  }
}

// Props passed to the main Verifier component
type VerifierProps = {
  onVerificationUpdate?: (state: VerificationState) => void // Callback for state changes
  onVerificationComplete?: (success: boolean) => void     // Callback when verification finishes
  repo: string      // GitHub repository to verify (e.g., "tinfoilsh/confidential-model-name")
  enclave: string   // Hostname of the enclave to verify
  isDarkMode?: boolean
}

type VerificationStatus = 'error' | 'pending' | 'loading' | 'success'

interface MeasurementData {
  measurement?: string
  certificate?: string
}

type VerificationState = {
  code: {
    status: VerificationStatus
    measurements?: MeasurementData
    error?: string
  }
  runtime: {
    status: VerificationStatus
    measurements?: MeasurementData  // Changed to MeasurementData to include certificate
    error?: string
  }
  security: {
    status: VerificationStatus
    error?: string
  }
}

type VerificationStepKey =
  | 'CODE_INTEGRITY'
  | 'REMOTE_ATTESTATION'
  | 'CODE_CONSISTENCY'

const VERIFICATION_STEPS = {
  REMOTE_ATTESTATION: {
    base: 'Enclave Attestation Verification',
    loading: 'Fetching Enclave Attestation...',
    success: 'Enclave Attestation Verified',
    key: 'REMOTE_ATTESTATION' as VerificationStepKey,
  },
  CODE_INTEGRITY: {
    base: 'Source Code Verification',
    loading: 'Fetching Source Code...',
    success: 'Source Code Verified',
    key: 'CODE_INTEGRITY' as VerificationStepKey,
  },
  CODE_CONSISTENCY: {
    base: 'Security Verification',
    loading: 'Checking Security...',
    success: 'Security Verified',
    key: 'CODE_CONSISTENCY' as VerificationStepKey,
  },
} as const

const getStepTitle = (
  stepKey: VerificationStepKey,
  status: VerificationStatus,
) => {
  const step = VERIFICATION_STEPS[stepKey]

  switch (status) {
    case 'loading':
      return step.loading
    case 'success':
      return step.success
    default:
      return step.base
  }
}

interface GitHubRelease {
  tag_name: string
}

const fetchLatestDigest = async (repo: string): Promise<string> => {
  // GitHub Proxy Note:
  // We use github-proxy.tinfoil.sh instead of direct GitHub API access to prevent
  // rate limiting issues that would break the UI for users. The proxy caches 
  // responses while preserving the integrity of the data. Since the fetched data
  // (release tags and hash files) is verified through Sigstore's transparency logs
  // in the verifyCode function, using a proxy does not compromise security.
  // These values are also signed by AMD/Sigstore.
  
  // First fetch the latest release to get the tag
  const releaseResponse = await fetch(
    `https://github-proxy.tinfoil.sh/repos/${repo}/releases/latest`,
  )
  if (!releaseResponse.ok) {
    throw new Error('Failed to fetch latest release')
  }
  const releaseData: GitHubRelease = await releaseResponse.json()
  const tag = releaseData.tag_name

  // Fetch the hash file directly using the tag with correct URL format
  const hashResponse = await fetch(
    `https://github-proxy.tinfoil.sh/${repo}/releases/download/${tag}/tinfoil.hash`,
  )
  if (!hashResponse.ok) {
    throw new Error('Failed to fetch hash file')
  }
  const hashContent = await hashResponse.text()
  return hashContent.trim()
}

export function Verifier({
  onVerificationUpdate,
  onVerificationComplete,
  repo,
  enclave,
  isDarkMode = true,
}: VerifierProps) {
  const [isWasmLoaded, setIsWasmLoaded] = useState(false)
  const [isSafari, setIsSafari] = useState(false)
  const [digest, setDigest] = useState<string | null>(null)
  const [verificationState, setVerificationState] = useState<VerificationState>(
    {
      code: {
        status: 'pending' as VerificationStatus,
        measurements: undefined,
        error: undefined,
      },
      runtime: {
        status: 'pending' as VerificationStatus,
        measurements: undefined,
        error: undefined,
      },
      security: {
        status: 'pending' as VerificationStatus,
        error: undefined,
      },
    },
  )

  const [isVerifying, setIsVerifying] = useState(false)

  const updateStepStatus = useCallback(
    (
      section: 'code' | 'runtime' | 'security',
      status: string,
      measurements: MeasurementData | null = null,
      error: string | null = null,
    ) => {
      setVerificationState((prev) => ({
        ...prev,
        [section]: {
          ...prev[section],
          status,
          ...(measurements && { measurements }),
          ...(error && { error }),
        },
      }))
    },
    [],
  )

  const verifyAll = useCallback(async () => {
    if (isVerifying) return
    setIsVerifying(true)

    const loadWasm = async () => {
      try {
        const go = new window.Go()
        const result = await WebAssembly.instantiateStreaming(
          fetch(VERIFIER_CONSTANTS.WASM_URL),
          go.importObject,
        )
        go.run(result.instance)
        setIsWasmLoaded(true)
        return true
      } catch (error) {
        updateStepStatus('code', 'error', null, 'Failed to load WASM verifier')
        return false
      }
    }

    const wasmLoaded = await loadWasm()
    if (!wasmLoaded) {
      setIsVerifying(false)
      return
    }

    let codeMeasurement = ''
    let runtimeMeasurement = ''

    try {
      // Reset all states to loading
      updateStepStatus('runtime', 'loading', null, null)
      updateStepStatus('code', 'loading', null, null)
      updateStepStatus('security', 'loading', null, null)

      let latestDigest: string | null = null

      // Fetch the latest digest first
      try {
        latestDigest = await fetchLatestDigest(repo)
        setDigest(latestDigest)
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        updateStepStatus(
          'code',
          'error',
          null,
          `Failed to fetch latest digest: ${errorMessage}`,
        )
        updateStepStatus('runtime', 'pending', null, null)
        updateStepStatus('security', 'pending', null, null)
        return
      }

      // Step 1: Verify runtime attestation
      try {
        const { certificate, measurement } = await window.verifyEnclave(enclave)
        runtimeMeasurement = measurement
        updateStepStatus('runtime', 'success', { measurement, certificate }, null)
      } catch (error) {
        // If runtime verification failed, mark as error and exit
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        updateStepStatus('runtime', 'error', null, errorMessage)
        updateStepStatus('code', 'pending', null, null)
        updateStepStatus('security', 'pending', null, null)
        return
      }

      // Step 2: Verify code integrity
      try {
        if (!latestDigest) {
          throw new Error('Digest not available')
        }
        const measurement = await window.verifyCode(repo, latestDigest)
        codeMeasurement = measurement
        updateStepStatus('code', 'success', { measurement }, null)

        // Only check security status if both steps succeeded
        if (codeMeasurement === runtimeMeasurement) {
          updateStepStatus('security', 'success', null, null)
        } else {
          updateStepStatus(
            'security',
            'error',
            null,
            'Code and runtime measurements do not match.',
          )
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        updateStepStatus('code', 'error', null, errorMessage)
        updateStepStatus('security', 'pending', null, null)
        return
      }
    } finally {
      setIsVerifying(false)
    }
  }, [enclave, repo, isVerifying, updateStepStatus])

  useEffect(() => {
    if (!isWasmLoaded) {
      verifyAll()
    }
  }, [isWasmLoaded, verifyAll])

  useEffect(() => {
    onVerificationUpdate?.(verificationState)
  }, [verificationState, onVerificationUpdate])

  useEffect(() => {
    // More robust Safari detection
    const isSafariCheck = () => {
      const ua = navigator.userAgent.toLowerCase()
      const isSafariMobile = ua.includes('safari') && ua.includes('mobile')
      const isIOS = /iphone|ipad|ipod/.test(ua)
      return (isSafariMobile || isIOS) && !ua.includes('chrome')
    }

    setIsSafari(isSafariCheck())
  }, [])

  useEffect(() => {
    // Check if all verifications are complete and successful
    const allComplete =
      verificationState.code.status !== 'pending' &&
      verificationState.code.status !== 'loading' &&
      verificationState.runtime.status !== 'pending' &&
      verificationState.runtime.status !== 'loading' &&
      verificationState.security.status !== 'pending' &&
      verificationState.security.status !== 'loading'

    const hasError =
      verificationState.code.status === 'error' ||
      verificationState.runtime.status === 'error' ||
      verificationState.security.status === 'error'

    const allSuccessful =
      verificationState.code.status === 'success' &&
      verificationState.runtime.status === 'success' &&
      verificationState.security.status === 'success'

    // Call the callback when verification is complete OR an error occurred
    if (allComplete || hasError) {
      onVerificationComplete?.(allSuccessful)
    }
  }, [verificationState, onVerificationComplete])

  return (
    <div
      className={`flex h-full w-full flex-col ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}
    >
      {/* Header with Verification Status */}
      <div className="flex-none">
        <VerificationStatus
          verificationState={verificationState}
          isDarkMode={isDarkMode}
        />
      </div>

      {/* Scrollable Content */}
      <div
        className="w-full flex-1 overflow-y-auto"
        style={{
          scrollbarGutter: 'stable',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Info Section */}
        <div
          className={`border-b ${isDarkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'} px-3 py-2 sm:px-4 sm:py-3`}
        >
          <p
            className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
          >
            This automated verification tool lets you independently confirm that
            the model is running in the secure enclave, ensuring your
            conversations remain completely private.
          </p>
          <div className="mt-2">
            <h4
              className={`mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}
            >
              Related Links
            </h4>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://docs.tinfoil.sh/verification/attestation-architecture"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-emerald-500 hover:text-emerald-400"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                  Attestation Architecture
                </a>
              </li>
              <li>
                <a
                  href="https://docs.tinfoil.sh/resources/how-it-works"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-emerald-500 hover:text-emerald-400"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                  How It Works
                </a>
              </li>
            </ul>
          </div>
        </div>
        {/* Verification Content */}
        <div className="space-y-3 p-3 pb-6 sm:space-y-4 sm:p-4">
          <div
            className={`flex w-full flex-col items-center gap-4 rounded-lg ${isDarkMode ? 'bg-blue-500/10' : 'bg-blue-50'} p-4`}
          >
            <div className="flex items-center justify-center gap-2">
              <div
                className={`h-5 w-5 ${isWasmLoaded ? (isDarkMode ? 'text-white' : 'text-gray-900') : isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}
              >
                {isWasmLoaded ? (
                  <ShieldCheckIcon />
                ) : (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
              </div>
              <span
                className={`text-sm ${isWasmLoaded ? (isDarkMode ? 'text-white' : 'text-gray-900') : isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
              >
                {isWasmLoaded ? (
                  <>
                    <a
                      href="https://github.com/tinfoilsh/verifier/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`underline ${isDarkMode ? 'hover:text-green-300' : 'hover:text-emerald-600'}`}
                    >
                      Verification Engine
                    </a>
                    {` Loaded (${VERIFIER_CONSTANTS.VERSION})`}
                  </>
                ) : (
                  'Loading verification module...'
                )}
              </span>
            </div>

            {isWasmLoaded && (
              <button
                onClick={verifyAll}
                disabled={isVerifying}
                className={`w-full max-w-[200px] rounded-lg border px-3 py-2 text-sm disabled:opacity-50 md:w-auto ${
                  isDarkMode
                    ? 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {isVerifying ? 'Verifying...' : 'Verify Enclave Again'}
              </button>
            )}
          </div>

          {/* Process Steps */}
          <ProcessStep
            title={getStepTitle(
              'REMOTE_ATTESTATION',
              verificationState.runtime.status,
            )}
            description="Verifies that the secure enclave environment is set up correctly. The response consists of a signed attestation by NVIDIA and AMD of the enclave environment and the digest of the binary (i.e., code) running inside it."
            status={verificationState.runtime.status}
            error={verificationState.runtime.error}
            measurements={verificationState.runtime.measurements}
            digestType="RUNTIME"
            repo={repo}
            isDarkMode={isDarkMode}
          />

          <ProcessStep
            title={getStepTitle(
              'CODE_INTEGRITY',
              verificationState.code.status,
            )}
            description="Verifies that the source code published publicly by Tinfoil on GitHub was correctly built through GitHub Actions and the resulting binary is available and immutable on the Sigstore transparency log."
            status={verificationState.code.status}
            error={verificationState.code.error}
            measurements={verificationState.code.measurements}
            digestType="SOURCE"
            repo={repo}
            githubHash={digest || undefined}
            isDarkMode={isDarkMode}
            links={[
              {
                text: 'GitHub Release',
                url: `https://github.com/${repo}/releases`,
              },
            ]}
          />

          <ProcessStep
            title={getStepTitle(
              'CODE_CONSISTENCY',
              verificationState.security.status,
            )}
            description="Verifies that the binary built from the source code matches the binary running in the enclave by comparing digests from the enclave and the transparency log."
            status={verificationState.security.status}
            error={verificationState.security.error}
            digestType="CODE_INTEGRITY"
            repo={repo}
            isDarkMode={isDarkMode}
          >
            {verificationState.code.measurements &&
              verificationState.runtime.measurements && (
                <MeasurementDiff
                  sourceMeasurements={verificationState.code.measurements}
                  runtimeMeasurements={verificationState.runtime.measurements}
                  isVerified={verificationState.security.status === 'success'}
                  isDarkMode={isDarkMode}
                />
              )}
          </ProcessStep>
        </div>
        {isSafari && <div className="h-[30px]" aria-hidden="true" />}{' '}
        {/* Safari-specific spacer */}
      </div>
    </div>
  )
}
