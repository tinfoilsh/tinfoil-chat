import {
  FaFile,
  FaFileAlt,
  FaFileArchive,
  FaFileAudio,
  FaFileCode,
  FaFileExcel,
  FaFileImage,
  FaFilePdf,
  FaFilePowerpoint,
  FaFileVideo,
  FaFileWord,
} from '@/components/icons/lazy-icons'
import { getFileIconType } from '../document-uploader'

type MacFileIconProps = {
  filename: string
  size?: number
  isDarkMode?: boolean
  isUploading?: boolean
  compact?: boolean
}

export function MacFileIcon({
  filename,
  size = 20,
  isDarkMode = false,
  isUploading = false,
  compact = false,
}: MacFileIconProps) {
  const type = getFileIconType(filename)

  // Get spinner size based on file icon size - using proper Tailwind classes
  const getSpinnerClasses = (iconSize: number) => {
    if (iconSize <= 16) return 'h-4 w-4'
    if (iconSize <= 24) return 'h-5 w-5'
    if (iconSize <= 32) return 'h-6 w-6'
    return 'h-8 w-8'
  }

  // If uploading, show spinner instead of file icon
  if (isUploading) {
    return (
      <div className="flex flex-col items-center">
        <div className="flex items-center justify-center rounded-md bg-surface-card/80 p-1 shadow-sm">
          <svg
            className={`${getSpinnerClasses(size)} animate-spin text-emerald-500`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        </div>
      </div>
    )
  }

  const iconElement = (
    <div className="relative inline-flex flex-col items-center justify-center">
      {/* Mac-style icon with subtle shadow */}
      <div
        className={`flex items-center justify-center rounded-lg p-2 shadow-md transition-all ${
          isDarkMode ? 'bg-gray-700' : 'bg-white'
        }`}
      >
        {type === 'pdf' && (
          <FaFilePdf size={size} className="text-red-600 dark:text-red-400" />
        )}
        {type === 'word' && (
          <FaFileWord
            size={size}
            className="text-blue-600 dark:text-blue-400"
          />
        )}
        {type === 'excel' && (
          <FaFileExcel
            size={size}
            className="text-green-600 dark:text-green-400"
          />
        )}
        {type === 'powerpoint' && (
          <FaFilePowerpoint
            size={size}
            className="text-orange-600 dark:text-orange-400"
          />
        )}
        {type === 'image' && (
          <FaFileImage
            size={size}
            className="text-purple-600 dark:text-purple-400"
          />
        )}
        {type === 'video' && (
          <FaFileVideo
            size={size}
            className="text-pink-600 dark:text-pink-400"
          />
        )}
        {type === 'audio' && (
          <FaFileAudio
            size={size}
            className="text-indigo-600 dark:text-indigo-400"
          />
        )}
        {type === 'archive' && (
          <FaFileArchive
            size={size}
            className="text-yellow-600 dark:text-yellow-400"
          />
        )}
        {type === 'code' && (
          <FaFileCode
            size={size}
            className="text-cyan-600 dark:text-cyan-400"
          />
        )}
        {type === 'text' && (
          <FaFileAlt size={size} className="text-gray-600 dark:text-gray-400" />
        )}
        {type === 'generic' && (
          <FaFile size={size} className="text-gray-500 dark:text-gray-400" />
        )}
      </div>
    </div>
  )

  if (compact) {
    return iconElement
  }

  return <div className="flex flex-col items-center">{iconElement}</div>
}
