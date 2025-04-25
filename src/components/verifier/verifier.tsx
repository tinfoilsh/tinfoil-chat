import { ShieldCheckIcon } from '@heroicons/react/24/outline'
import { useCallback, useEffect, useState } from 'react'
import '../../../wasm_exec.js'
import { MeasurementDiff } from './measurement-diff'
import { ProcessStep } from './process-step'
import VerificationStatus from './verification-status'


declare global {
  interface Window {
    Go: any

    verifyEnclave(enclaveHostname: string): Promise<{
      certificate: string
      measurement: string
    }>

    verifyCode(repo: string, digest: string): Promise<string>
  }
}

type VerifierProps = {
  onVerificationUpdate?: (state: VerificationState) => void
  onVerificationComplete?: (success: boolean) => void
  repo: string
  enclave: string
}

type VerificationStatus = 'error' | 'pending' | 'loading' | 'success'

type VerificationState = {
  code: {
    status: VerificationStatus
    measurements: any
    error?: string
  }
  runtime: {
    status: VerificationStatus
    measurements: any
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
  CODE_INTEGRITY: {
    base: 'Code Integrity Check',
    loading: 'Checking Code Integrity...',
    success: 'Code Integrity Checked',
    key: 'CODE_INTEGRITY' as VerificationStepKey,
  },
  REMOTE_ATTESTATION: {
    base: 'Enclave Runtime Attestation',
    loading: 'Fetching Attestation Report...',
    success: 'Enclave Runtime Checked',
    key: 'REMOTE_ATTESTATION' as VerificationStepKey,
  },
  CODE_CONSISTENCY: {
    base: 'Consistency Check',
    loading: 'Checking Binary Consistency...',
    success: 'Binaries Match',
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

const fetchLatestDigest = async (repo: string): Promise<string> => {
  // First fetch the latest release to get the tag
  console.log(`Fetching latest digest for ${repo}`)
  const releaseResponse = await fetch(`https://api-github-proxy.tinfoil.sh/repos/${repo}/releases/latest`)
  if (!releaseResponse.ok) {
    throw new Error('Failed to fetch latest release')
  }
  const releaseData = await releaseResponse.json()
  const tag = releaseData.tag_name

  // Fetch the hash file directly using the tag
  const hashResponse = await fetch(`https://api-github-proxy.tinfoil.sh/repos/${repo}/releases/download/${tag}/tinfoil.hash`)
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
      measurements: any = null,
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
          fetch(
            'https://tinfoilsh.github.io/verifier-js/tinfoil-verifier.wasm',
          ),
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

    let codeMeasurement = ""
    let runtimeMeasurement = ""

    try {

      // Reset all states to loading
      updateStepStatus('code', 'loading', null, null)
      updateStepStatus('runtime', 'loading', runtimeMeasurement, null)
      updateStepStatus('security', 'loading', null, null)

      // Fetch the latest digest first
      try {
        const latestDigest = await fetchLatestDigest(repo)
        setDigest(latestDigest)
      } catch (error: any) {
        updateStepStatus('code', 'error', null, `Failed to fetch latest digest: ${error.message}`)
        updateStepStatus('runtime', 'pending', null, null)
        updateStepStatus('security', 'pending', null, null)
        return
      }

      // Step 1: Verify code integrity
      try {
        if (!digest) {
          throw new Error('Digest not available')
        }
        const measurement = await window.verifyCode(repo, digest)
        codeMeasurement = measurement
        updateStepStatus('code', 'success', { measurement }, null)
      } catch (error: any) {
        updateStepStatus('code', 'error', null, error.toString())
        updateStepStatus('runtime', 'pending', null, null)
        updateStepStatus('security', 'pending', null, null)
        return
      }

      // Step 2: Verify runtime attestation
      try {
        const { certificate, measurement } = await window.verifyEnclave(enclave)
        runtimeMeasurement = measurement
        updateStepStatus(
          'runtime',
          'success',
          measurement,
          null,
        )
        updateStepStatus('security', 'pending', null, null)
      } catch (error: any) {
        // If runtime verification failed, keep code success but mark runtime and security as error
        updateStepStatus('runtime', 'error', null, error.toString())
        updateStepStatus('security', 'pending', null, null)
      }
    } finally {

      if (codeMeasurement == runtimeMeasurement) {
        updateStepStatus('security', 'success', null, null)
      } else {
        updateStepStatus('security', 'error', null, 'Code and runtime measurements do not match')
      }
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
    <div className="flex h-full w-full flex-col bg-gray-900">
      {/* Header with Verification Status */}
      <div className="flex-none">
        <VerificationStatus verificationState={verificationState} />
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
        <div className="border-b border-gray-800 bg-gray-900 px-3 py-2 sm:px-4 sm:py-3">
          <p className="text-xs text-gray-400">
            This automated verification tool lets you independently confirm that
            the model is running in the secure enclave, ensuring your
            conversations remain completely private.
          </p>
        </div>
        {/* Verification Content */}
        <div className="space-y-3 p-3 pb-6 sm:space-y-4 sm:p-4">
          <div
            className={`flex w-full flex-col items-center gap-4 rounded-lg bg-blue-500/10 p-4`}
          >
            <div className="flex items-center justify-center gap-2">
              <div
                className={`h-5 w-5 ${isWasmLoaded ? 'text-white' : 'text-gray-400'}`}
              >
                {isWasmLoaded ? (
                  <ShieldCheckIcon />
                ) : (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
              </div>
              <span
                className={`text-sm ${isWasmLoaded ? 'text-white' : 'text-gray-300'}`}
              >
                {isWasmLoaded ? (
                  <>
                    <a
                      href="https://github.com/tinfoilsh/verifier/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-green-300"
                    >
                      Verification Engine
                    </a>
                    {' Loaded'}
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
                className="w-full max-w-[200px] rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50 md:w-auto"
              >
                {isVerifying ? 'Verifying...' : 'Verify Enclave Again'}
              </button>
            )}
          </div>

          {/* Process Steps */}
          <ProcessStep
            title={getStepTitle(
              'CODE_INTEGRITY',
              verificationState.code.status,
            )}
            description="Verifies that the source code published on GitHub was correctly built and the resulting binary was published to the Sigstore transparency log."
            status={verificationState.code.status}
            error={verificationState.code.error}
            measurements={verificationState.code.measurements}
            digestType="SOURCE"
            links={[
              {
                text: 'GitHub Release',
                url: `https://github.com/${repo}/releases`,
              },
            ]}
          />

          <ProcessStep
            title={getStepTitle(
              'REMOTE_ATTESTATION',
              verificationState.runtime.status,
            )}
            description="Verifies that the remote secure enclave environment is set up correctly and receive the digest of the binary running in the enclave."
            status={verificationState.runtime.status}
            error={verificationState.runtime.error}
            measurements={verificationState.runtime.measurements}
            digestType="RUNTIME"
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
          >
            {verificationState.code.measurements &&
              verificationState.runtime.measurements && (
                <MeasurementDiff
                  sourceMeasurements={verificationState.code.measurements}
                  runtimeMeasurements={verificationState.runtime.measurements}
                  isVerified={verificationState.security.status === 'success'}
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
