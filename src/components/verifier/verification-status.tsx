import { CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'

type VerificationState = {
  [key: string]: {
    status: string
    error?: string
  }
}

type VerificationStatusProps = {
  verificationState: VerificationState
  showDetailsLink?: boolean
}

export function VerificationStatus({
  verificationState,
  showDetailsLink = false,
}: VerificationStatusProps) {
  const hasErrors = Object.values(verificationState).some(
    (state) => state.error,
  )
  const allSuccess = Object.values(verificationState).every(
    (state) => state.status === 'success',
  )

  if (hasErrors) {
    return (
      <div className="mt-0 flex items-start gap-2 bg-red-500/10 p-3 text-red-400">
        <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <p className="overflow-hidden break-words break-all text-sm">
          Verification failed. Please check the detailed error messages in each
          step above.
        </p>
      </div>
    )
  }

  if (allSuccess) {
    return (
      <div className="flex items-center gap-2 bg-emerald-500/10 p-3 text-emerald-400">
        <CheckIcon className="h-5 w-5 flex-shrink-0" />
        <div>
          <p className="text-sm">
            All verifications completed successfully! Your chat is completely
            confidential.
            {showDetailsLink && (
              <>
                {' '}
                <button
                  onClick={() => {
                    document.querySelector('#verifier')?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    })
                  }}
                  className="text-emerald-500 hover:text-emerald-400"
                >
                  View verification details
                </button>
                .
              </>
            )}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2 bg-blue-500/10 p-3 text-blue-400">
      <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-[2px] border-solid border-current border-t-transparent" />
      <p className="break-words text-sm">
        Verification in progress. This process ensures your data remains secure
        and private by confirming code integrity and runtime environment
        isolation.
      </p>
    </div>
  )
}

export default VerificationStatus
