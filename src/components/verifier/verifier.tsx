import type { VerifyEnclaveResult } from '@/utils/ehbp-client'
import { useCallback, useEffect, useState } from 'react'
// Import WASM Go runtime - provides the Go WebAssembly runtime needed to execute
// the enclave verification functions written in Go
import { AiOutlineLoading3Quarters } from 'react-icons/ai'
import { FaGithub } from 'react-icons/fa'
import { FiTool } from 'react-icons/fi'
import { LuExternalLink, LuRefreshCcwDot } from 'react-icons/lu'
import { CONSTANTS } from '../chat/constants'
import { CollapsibleFlowDiagram } from './collapsible-flow-diagram'
import { VERIFIER_CONSTANTS } from './constants'
import { MeasurementDiff } from './measurement-diff'
import { ProcessStep } from './process-step'
import { VerificationFlow } from './verification-flow'
import VerificationStatus from './verification-status'
import './wasm_exec.js'

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
    verifyEnclave?: (enclaveHostname: string) => Promise<VerifyEnclaveResult>
    // Performs source code verification using GitHub Actions and Sigstore
    // Returns the measurement from the verified build process
    verifyCode(repo: string, digest: string): Promise<string>
  }
}

// Props passed to the main Verifier component
type VerifierProps = {
  onVerificationUpdate?: (state: VerificationState) => void // Callback for state changes
  onVerificationComplete?: (success: boolean) => void // Callback when verification finishes
  isDarkMode?: boolean
  flowDiagramExpanded?: boolean
  onFlowDiagramToggle?: () => void
}

type VerificationStatus = 'error' | 'pending' | 'loading' | 'success'

interface MeasurementData {
  measurement?: string
  certificate?: string
  hpkePublicKey?: string
}

type VerificationState = {
  code: {
    status: VerificationStatus
    measurements?: MeasurementData
    error?: string
  }
  runtime: {
    status: VerificationStatus
    measurements?: MeasurementData // Changed to MeasurementData to include certificate
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
    loading: 'Checking Measurements...',
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
  isDarkMode = true,
  flowDiagramExpanded,
  onFlowDiagramToggle,
}: VerifierProps) {
  const [isWasmLoaded, setIsWasmLoaded] = useState(false)
  const [isSafari, setIsSafari] = useState(false)
  const [digest, setDigest] = useState<string | null>(null)

  // The inference proxy handles all model requests
  // Use the proxy constants from the shared constants file
  const repo = CONSTANTS.INFERENCE_PROXY_REPO
  const enclave = CONSTANTS.INFERENCE_PROXY_URL.replace('https://', '')

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
  const [verificationStatus, setVerificationStatus] = useState<
    'idle' | 'verifying' | 'success' | 'error'
  >('idle')

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

      // Fetch the latest digest first using the actual repo
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

      // Step 1: Verify runtime attestation using the actual enclave
      try {
        const verifyEnclave = window.verifyEnclave
        if (!verifyEnclave) {
          throw new Error('Verifier runtime unavailable')
        }

        const { certificate, measurement, hpke_public_key } =
          await verifyEnclave(enclave)
        runtimeMeasurement = measurement
        updateStepStatus(
          'runtime',
          'success',
          {
            measurement,
            certificate,
            hpkePublicKey: hpke_public_key,
          },
          null,
        )
      } catch (error) {
        // If runtime verification failed, mark as error and exit
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        updateStepStatus('runtime', 'error', null, errorMessage)
        updateStepStatus('code', 'pending', null, null)
        updateStepStatus('security', 'pending', null, null)
        return
      }

      // Step 2: Verify code integrity using the actual repo
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
  }, [repo, enclave, isVerifying, updateStepStatus])

  useEffect(() => {
    if (!isWasmLoaded) {
      verifyAll()
    }
  }, [isWasmLoaded, verifyAll])

  useEffect(() => {
    onVerificationUpdate?.(verificationState)

    // Update verification status for the flow diagram
    if (
      verificationState.code.status === 'loading' ||
      verificationState.runtime.status === 'loading' ||
      verificationState.security.status === 'loading'
    ) {
      setVerificationStatus('verifying')
    } else if (
      verificationState.code.status === 'success' &&
      verificationState.runtime.status === 'success' &&
      verificationState.security.status === 'success'
    ) {
      setVerificationStatus('success')
    } else if (
      verificationState.code.status === 'error' ||
      verificationState.runtime.status === 'error' ||
      verificationState.security.status === 'error'
    ) {
      setVerificationStatus('error')
    }
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
      className={`flex h-full w-full flex-col ${isDarkMode ? 'bg-gray-900' : 'bg-surface-card'}`}
    >
      {/* Fixed Verification Banner */}
      <div className="flex-none">
        <VerificationStatus
          verificationState={verificationState}
          isDarkMode={isDarkMode}
        />
      </div>

      {/* Scrollable Content */}
      <div
        className="relative w-full flex-1 overflow-y-auto"
        style={{
          scrollbarGutter: 'stable',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Scrollable title and description section */}
        <div className="px-3 py-3 sm:px-4 sm:py-4">
          {/* Title - left aligned like process steps */}
          <div className="mb-3 flex items-center gap-3">
            <div className="flex items-center">
              <FiTool className="h-5 w-5 text-content-secondary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-content-primary">
                Verification Tool
              </h3>
            </div>
            <div className="flex items-center">
              <span className="inline-flex items-center rounded-full bg-surface-chat/80 px-2.5 py-0.5 text-[10px] text-content-secondary">
                In-Browser Verifier {VERIFIER_CONSTANTS.VERSION}
              </span>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-content-secondary">
            This automated verification tool lets you independently confirm that
            the models are running in secure enclaves, ensuring your
            conversations remain completely private.{' '}
            <a
              href="https://docs.tinfoil.sh/verification/attestation-architecture"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:text-accent/80 hover:underline"
            >
              Attestation architecture
              <LuExternalLink className="h-3.5 w-3.5" />
            </a>
          </p>
          {/* Action buttons section */}
          <div className="my-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (!isVerifying) {
                    void verifyAll()
                  }
                }}
                disabled={isVerifying}
                className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  isDarkMode
                    ? 'border-border-strong bg-surface-chat text-content-primary hover:bg-surface-chat/80 disabled:cursor-not-allowed disabled:text-content-muted disabled:hover:bg-surface-chat'
                    : 'border-border-subtle bg-surface-card text-content-secondary hover:bg-surface-card/80 disabled:cursor-not-allowed disabled:text-content-muted disabled:hover:bg-surface-card'
                }`}
              >
                {isVerifying ? (
                  <AiOutlineLoading3Quarters className="h-4 w-4 animate-spin" />
                ) : (
                  <LuRefreshCcwDot className="h-4 w-4" />
                )}
                {isVerifying ? 'Verifying...' : 'Verify Again'}
              </button>

              <button
                onClick={() =>
                  window.open(
                    'https://github.com/tinfoilsh/verifier/',
                    '_blank',
                    'noopener,noreferrer',
                  )
                }
                className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  isDarkMode
                    ? 'border-border-strong bg-surface-chat text-content-primary hover:bg-surface-chat/80'
                    : 'border-border-subtle bg-surface-card text-content-secondary hover:bg-surface-card/80'
                }`}
              >
                <FaGithub className="h-4 w-4" />
                View Code
              </button>
            </div>
          </div>
        </div>
        {/* Verification Content */}
        <div className="space-y-3 px-3 pb-6 sm:space-y-4 sm:px-4">
          {/* Verification Flow Diagram - Collapsible */}
          <CollapsibleFlowDiagram
            isDarkMode={isDarkMode}
            isExpanded={flowDiagramExpanded}
            onToggle={onFlowDiagramToggle}
          >
            <VerificationFlow
              isDarkMode={isDarkMode}
              verificationStatus={verificationStatus}
            />
          </CollapsibleFlowDiagram>

          {/* Process Steps */}
          <ProcessStep
            title={getStepTitle(
              'REMOTE_ATTESTATION',
              verificationState.runtime.status,
            )}
            description="Verifies the secure hardware environment. The response consists of a signed measurement by a combination of NVIDIA, AMD, and Intel certifying the enclave environment and the digest of the binary (i.e., code) actively running inside it."
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
            description="Verifies that the source code published publicly by Tinfoil on GitHub was correctly built through GitHub Actions and that the resulting binary is available on the Sigstore transparency log."
            status={verificationState.code.status}
            error={verificationState.code.error}
            measurements={verificationState.code.measurements}
            digestType="SOURCE"
            repo={repo}
            githubHash={digest || undefined}
            isDarkMode={isDarkMode}
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
