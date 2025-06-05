import { CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import Image from 'next/image'

type VerificationState = {
  [key: string]: {
    status: string
    error?: string
  }
}

type VerificationStatusProps = {
  verificationState: VerificationState
  isDarkMode?: boolean
}

export function VerificationStatus({
  verificationState,
  isDarkMode = true,
}: VerificationStatusProps) {
  const hasErrors = Object.values(verificationState).some(
    (state) => state.error,
  )
  const allSuccess = Object.values(verificationState).every(
    (state) => state.status === 'success',
  )

  if (hasErrors) {
    return (
      <div className={`mt-0 flex items-start gap-2 p-3 ${
        isDarkMode 
          ? 'bg-red-500/10 text-red-400' 
          : 'bg-red-50 text-red-600'
      }`}>
        <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <p className="overflow-hidden break-words break-all text-sm">
          Verification failed. Please check the error messages.
        </p>
      </div>
    )
  }

  if (allSuccess) {
    return (
      <div className={`flex items-start gap-2 p-3 ${
        isDarkMode 
          ? 'bg-emerald-500/10 text-emerald-400' 
          : 'bg-emerald-50 text-emerald-600'
      }`}>
        <CheckIcon className="h-5 w-5 flex-shrink-0" />
        <div className="flex flex-col gap-1">
          <p className="text-sm">
            Your chat is confidential.
          </p>
          <div className={`flex items-center gap-2 opacity-70 ${
            isDarkMode ? 'text-white' : 'text-gray-700'
          }`}>
            <span className="text-sm">Attested by</span>
              <Image
              src="/verification-logos/nvidia.svg"
              alt="NVIDIA"
              width={50}
              height={15}
              className={`${!isDarkMode ? 'invert' : ''} pt-0.5`}
            />
            <span className="text-sm">and</span>
            <Image
              src="/verification-logos/amd.svg"
              alt="AMD"
              width={35}
              height={15}
              className={`${isDarkMode ? 'invert' : ''} pt-0.5`}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-start gap-2 p-3 ${
      isDarkMode 
        ? 'bg-blue-500/10 text-blue-400' 
        : 'bg-blue-50 text-blue-600'
    }`}>
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
