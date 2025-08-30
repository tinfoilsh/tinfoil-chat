'use client'

import { getFileIconType } from '@/components/chat/document-uploader'
import { memo } from 'react'
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
} from 'react-icons/fa'

interface DocumentListProps {
  documents: Array<{ name: string }>
  imageData?: Array<{ base64: string; mimeType: string }>
  isDarkMode: boolean
}

export const DocumentList = memo(function DocumentList({
  documents,
  imageData,
  isDarkMode,
}: DocumentListProps) {
  const getFileIcon = (filename: string) => {
    const type = getFileIconType(filename)
    const iconProps = {
      className: `h-5 w-5 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`,
      'aria-hidden': true,
    }
    switch (type) {
      case 'pdf':
        return <FaFilePdf {...iconProps} />
      case 'docx':
        return <FaFileWord {...iconProps} />
      case 'pptx':
        return <FaFilePowerpoint {...iconProps} />
      case 'xlsx':
      case 'csv':
        return <FaFileExcel {...iconProps} />
      case 'image':
        return <FaFileImage {...iconProps} />
      case 'audio':
        return <FaFileAudio {...iconProps} />
      case 'video':
        return <FaFileVideo {...iconProps} />
      case 'zip':
        return <FaFileArchive {...iconProps} />
      case 'html':
      case 'js':
      case 'ts':
      case 'css':
      case 'md':
        return <FaFileCode {...iconProps} />
      case 'txt':
        return <FaFileAlt {...iconProps} />
      default:
        return <FaFile {...iconProps} />
    }
  }

  if (!documents || documents.length === 0) {
    return null
  }

  return (
    <div className="mb-2 flex flex-wrap justify-end gap-2 px-4">
      {documents.map((doc, index) => {
        const hasImageData = imageData && imageData[index]
        const isImage = doc.name
          .toLowerCase()
          .match(/\.(jpg|jpeg|png|gif|webp|bmp|tiff)$/i)

        return (
          <div
            key={index}
            className={`flex items-center rounded-lg ${
              isDarkMode
                ? 'bg-gray-700/50 hover:bg-gray-700/70'
                : 'bg-gray-100 hover:bg-gray-200'
            } overflow-hidden transition-colors duration-200`}
          >
            {hasImageData && isImage ? (
              <div className="flex items-center">
                <div className="h-10 w-10 overflow-hidden">
                  <img
                    src={`data:${imageData![index].mimeType};base64,${imageData![index].base64}`}
                    alt={doc.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <span
                  className={`ml-2 mr-3 max-w-[150px] truncate text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}
                >
                  {doc.name}
                </span>
              </div>
            ) : (
              <div className="flex items-center px-3 py-1.5">
                <div className="mr-2">{getFileIcon(doc.name)}</div>
                <span
                  className={`max-w-[150px] truncate text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}
                >
                  {doc.name}
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
})
