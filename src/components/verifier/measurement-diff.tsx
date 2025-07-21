import { CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'

interface MeasurementData {
  measurement?: string
  certificate?: string
}

type MeasurementDiffProps = {
  sourceMeasurements: MeasurementData | string
  runtimeMeasurements: MeasurementData | string
  isVerified: boolean
  isDarkMode?: boolean
}

// Utility function to extract measurement value
const extractMeasurement = (data: MeasurementData | string): string => {
  if (typeof data === 'string') {
    // Check if it's a JSON string that needs parsing
    try {
      const parsed = JSON.parse(data)
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
    return data
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
  return JSON.stringify(data, null, 2).replace(/"/g, '')
}

export function MeasurementDiff({
  sourceMeasurements,
  runtimeMeasurements,
  isVerified,
  isDarkMode = true,
}: MeasurementDiffProps) {
  return (
    <div className="mt-4">
      <h3
        className={`mb-4 text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}
      >
        Measurement Comparison
      </h3>

      <div
        className={`mb-4 flex items-center gap-2 rounded-lg p-3 ${
          isVerified
            ? isDarkMode
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-emerald-50 text-emerald-600'
            : isDarkMode
              ? 'bg-red-500/10 text-red-400'
              : 'bg-red-50 text-red-600'
        }`}
      >
        {isVerified ? (
          <CheckIcon className="h-5 w-5" />
        ) : (
          <ExclamationTriangleIcon className="h-5 w-5" />
        )}
        <span>
          {isVerified ? 'Measurements Match' : 'Measurement mismatch detected'}
        </span>
      </div>

      <div className="space-y-4">
        <div>
          <h4
            className={`mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
          >
            Source Measurement
            <span
              className={`block text-xs font-normal ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
            >
              Received from GitHub and Sigstore.
            </span>
          </h4>
          <div className="max-h-[200px] overflow-auto">
            <pre
              className={`overflow-x-auto whitespace-pre-wrap break-all rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'} p-3 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} border ${isVerified ? 'border-emerald-500/50' : isDarkMode ? 'border-gray-700' : 'border-gray-300'}`}
            >
              {extractMeasurement(sourceMeasurements)}
            </pre>
          </div>
        </div>

        <div>
          <h4
            className={`mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
          >
            Runtime Measurement
            <span
              className={`block text-xs font-normal ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
            >
              Received from the enclave.
            </span>
          </h4>
          <div className="max-h-[200px] overflow-auto">
            <pre
              className={`overflow-x-auto whitespace-pre-wrap break-all rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'} p-3 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} border ${isVerified ? 'border-emerald-500/50' : isDarkMode ? 'border-gray-700' : 'border-gray-300'}`}
            >
              {extractMeasurement(runtimeMeasurements)}
            </pre>
          </div>
        </div>

        {!isVerified && (
          <div
            className={`flex items-start gap-2 rounded-lg ${isDarkMode ? 'bg-yellow-500/10' : 'bg-yellow-50'} p-3 ${isDarkMode ? 'text-yellow-400' : 'text-yellow-700'}`}
          >
            <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <div>
              <p className="break-normal text-sm font-medium">
                Differences detected:
              </p>
              <p className="mt-1 break-normal text-sm">
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
