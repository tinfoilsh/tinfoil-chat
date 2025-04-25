import { CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'

type MeasurementDiffProps = {
  sourceMeasurements: any
  runtimeMeasurements: any
  isVerified: boolean
}

// Utility function to extract measurement value
const extractMeasurement = (data: any): string => {
  if (typeof data === 'object' && data?.measurement) {
    return data.measurement;
  }
  return JSON.stringify(data, null, 2).replace(/"/g, '');
}

export function MeasurementDiff({
  sourceMeasurements,
  runtimeMeasurements,
  isVerified,
}: MeasurementDiffProps) {
  return (
    <div className="mt-4">
      <h3 className="mb-4 text-sm font-medium text-gray-200">
        Digest Comparison
      </h3>

      <div
        className={`mb-4 flex items-center gap-2 rounded-lg p-3 ${
          isVerified
            ? 'bg-emerald-500/10 text-emerald-400'
            : 'bg-red-500/10 text-red-400'
        }`}
      >
        {isVerified ? (
          <CheckIcon className="h-5 w-5" />
        ) : (
          <ExclamationTriangleIcon className="h-5 w-5" />
        )}
        <span>{isVerified ? 'Digests match' : 'Digests do not match'}</span>
      </div>

      <div className="space-y-4">
        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-300">
            Source binary digest
            <span className="block text-xs font-normal text-gray-400">
              Received from GitHub and Sigstore
            </span>
          </h4>
          <div className="max-h-[200px] overflow-auto">
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-gray-800 p-3 text-sm text-gray-300">
              {extractMeasurement(sourceMeasurements)}
            </pre>
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-300">
            Runtime binary digest
            <span className="block text-xs font-normal text-gray-400">
              Received from the enclave
            </span>
          </h4>
          <div className="max-h-[200px] overflow-auto">
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-gray-800 p-3 text-sm text-gray-300">
              {extractMeasurement(runtimeMeasurements)}
            </pre>
          </div>
        </div>

        {!isVerified && (
          <div className="flex items-start gap-2 rounded-lg bg-yellow-500/10 p-3 text-yellow-400">
            <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Differences detected:</p>
              <p className="mt-1 overflow-hidden break-words break-all text-sm">
                Please check the hash above for discrepancies. This indicates a
                potential security issue.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
