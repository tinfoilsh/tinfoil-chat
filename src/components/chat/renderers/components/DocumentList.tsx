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
      className: 'h-5 w-5 text-content-secondary',
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
        // Create a stable key using document name
        // If multiple docs have the same name, append occurrence count to ensure uniqueness
        const nameCount = documents.filter(
          (d, i) => i <= index && d.name === doc.name,
        ).length
        const uniqueKey = nameCount > 1 ? `${doc.name}-${nameCount}` : doc.name

        return (
          <div
            key={uniqueKey}
            className="flex items-center gap-2 overflow-hidden rounded-lg border border-border-subtle bg-surface-chat px-2.5 py-1.5 text-content-primary shadow-sm transition-colors duration-200 hover:bg-surface-chat/80"
          >
            {hasImageData ? (
              <div className="flex items-center">
                <div className="h-10 w-10 overflow-hidden rounded-md border border-border-subtle bg-surface-card">
                  <img
                    src={`data:${imageData![index].mimeType};base64,${imageData![index].base64}`}
                    alt={doc.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <span className="ml-2 mr-3 max-w-[180px] truncate text-sm">
                  {doc.name}
                </span>
              </div>
            ) : (
              <>
                <div className="mr-1.5 text-content-secondary">
                  {getFileIcon(doc.name)}
                </div>
                <span className="max-w-[180px] truncate text-sm">
                  {doc.name}
                </span>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
})
