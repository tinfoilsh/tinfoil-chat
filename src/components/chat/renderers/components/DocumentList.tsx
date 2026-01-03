import { XMarkIcon } from '@heroicons/react/24/outline'
import { memo, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  BsFile,
  BsFiletypeCss,
  BsFiletypeCsv,
  BsFiletypeDoc,
  BsFiletypeDocx,
  BsFiletypeGif,
  BsFiletypeHtml,
  BsFiletypeJpg,
  BsFiletypeJs,
  BsFiletypeJson,
  BsFiletypeJsx,
  BsFiletypeMd,
  BsFiletypeMov,
  BsFiletypeMp3,
  BsFiletypeMp4,
  BsFiletypePdf,
  BsFiletypePng,
  BsFiletypePpt,
  BsFiletypePptx,
  BsFiletypeTsx,
  BsFiletypeTxt,
  BsFiletypeWav,
  BsFiletypeXls,
  BsFiletypeXlsx,
  BsFiletypeXml,
} from 'react-icons/bs'

interface DocumentListProps {
  documents: Array<{ name: string }>
  documentContent?: string
  imageData?: Array<{ base64: string; mimeType: string }>
}

function getFileIcon(filename: string, size: number = 20) {
  const extension = filename.toLowerCase().split('.').pop() || ''
  const iconClass = 'text-content-secondary'

  switch (extension) {
    case 'pdf':
      return <BsFiletypePdf size={size} className={iconClass} />
    case 'doc':
      return <BsFiletypeDoc size={size} className={iconClass} />
    case 'docx':
      return <BsFiletypeDocx size={size} className={iconClass} />
    case 'xls':
      return <BsFiletypeXls size={size} className={iconClass} />
    case 'xlsx':
      return <BsFiletypeXlsx size={size} className={iconClass} />
    case 'csv':
      return <BsFiletypeCsv size={size} className={iconClass} />
    case 'ppt':
      return <BsFiletypePpt size={size} className={iconClass} />
    case 'pptx':
      return <BsFiletypePptx size={size} className={iconClass} />
    case 'html':
    case 'htm':
      return <BsFiletypeHtml size={size} className={iconClass} />
    case 'css':
      return <BsFiletypeCss size={size} className={iconClass} />
    case 'js':
      return <BsFiletypeJs size={size} className={iconClass} />
    case 'jsx':
      return <BsFiletypeJsx size={size} className={iconClass} />
    case 'ts':
    case 'tsx':
      return <BsFiletypeTsx size={size} className={iconClass} />
    case 'json':
      return <BsFiletypeJson size={size} className={iconClass} />
    case 'md':
      return <BsFiletypeMd size={size} className={iconClass} />
    case 'xml':
      return <BsFiletypeXml size={size} className={iconClass} />
    case 'txt':
      return <BsFiletypeTxt size={size} className={iconClass} />
    case 'png':
      return <BsFiletypePng size={size} className={iconClass} />
    case 'jpg':
    case 'jpeg':
      return <BsFiletypeJpg size={size} className={iconClass} />
    case 'gif':
      return <BsFiletypeGif size={size} className={iconClass} />
    case 'mp3':
      return <BsFiletypeMp3 size={size} className={iconClass} />
    case 'wav':
      return <BsFiletypeWav size={size} className={iconClass} />
    case 'mp4':
      return <BsFiletypeMp4 size={size} className={iconClass} />
    case 'mov':
      return <BsFiletypeMov size={size} className={iconClass} />
    default:
      return <BsFile size={size} className={iconClass} />
  }
}

function getPreviewForDocument(
  documentContent: string | undefined,
  docName: string,
): string | null {
  if (!documentContent) return null

  const docHeader = `Document title: ${docName}`
  const headerIndex = documentContent.indexOf(docHeader)

  if (headerIndex === -1) return null

  const contentsMarker = 'Document contents:\n'
  const contentsStart = documentContent.indexOf(contentsMarker, headerIndex)
  if (contentsStart === -1) return null

  const startIndex = contentsStart + contentsMarker.length
  const nextDocIndex = documentContent.indexOf('\nDocument title: ', startIndex)
  const docSection =
    nextDocIndex === -1
      ? documentContent.slice(startIndex)
      : documentContent.slice(startIndex, nextDocIndex)

  const lines = docSection.split('\n').filter((line) => {
    const trimmed = line.trim()
    if (!trimmed) return false
    if (trimmed.startsWith('# ')) return false
    return true
  })

  return lines.slice(0, 2).join('\n') || null
}

export const DocumentList = memo(function DocumentList({
  documents,
  documentContent,
  imageData,
}: DocumentListProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [modalContent, setModalContent] = useState<{
    name: string
    content: string
  } | null>(null)

  useEffect(() => {
    if (!modalOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModalOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [modalOpen])

  if (!documents || documents.length === 0) {
    return null
  }

  const openModal = (docName: string) => {
    if (!documentContent) return

    const docHeader = `Document title: ${docName}`
    const headerIndex = documentContent.indexOf(docHeader)

    if (headerIndex === -1) return

    const contentsMarker = 'Document contents:\n'
    const contentsStart = documentContent.indexOf(contentsMarker, headerIndex)
    if (contentsStart === -1) return

    const startIndex = contentsStart + contentsMarker.length
    const nextDocIndex = documentContent.indexOf(
      '\nDocument title: ',
      startIndex,
    )
    const docSection =
      nextDocIndex === -1
        ? documentContent.slice(startIndex)
        : documentContent.slice(startIndex, nextDocIndex)

    setModalContent({ name: docName, content: docSection.trim() })
    setModalOpen(true)
  }

  return (
    <>
      <div className="mb-2 flex flex-wrap justify-end gap-2 px-4">
        {documents.map((doc, index) => {
          const hasImageData = imageData && imageData[index]
          const nameCount = documents.filter(
            (d, i) => i <= index && d.name === doc.name,
          ).length
          const uniqueKey =
            nameCount > 1 ? `${doc.name}-${nameCount}` : doc.name
          const preview = getPreviewForDocument(documentContent, doc.name)

          return (
            <div
              key={uniqueKey}
              role="button"
              tabIndex={0}
              onClick={() => openModal(doc.name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openModal(doc.name)
                }
              }}
              className="flex min-w-[200px] max-w-[300px] cursor-pointer flex-col rounded-lg bg-surface-message-user/90 p-3 shadow-sm backdrop-blur-sm transition-colors hover:bg-surface-message-user"
            >
              <div className="flex items-center gap-2">
                {hasImageData ? (
                  <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-md border border-border-subtle bg-surface-card">
                    <img
                      src={`data:${imageData![index].mimeType};base64,${imageData![index].base64}`}
                      alt={doc.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center p-1">
                    {getFileIcon(doc.name, 20)}
                  </div>
                )}
                <span className="truncate text-sm font-medium text-content-primary">
                  {doc.name}
                </span>
              </div>

              {preview && (
                <div className="mt-2 line-clamp-2 text-xs text-content-muted">
                  {preview}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {modalOpen &&
        modalContent &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            onClick={() => setModalOpen(false)}
          >
            <div className="fixed inset-0 bg-black/50" />

            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="document-modal-title"
              className="relative z-10 flex h-[80vh] w-[90vw] max-w-4xl flex-col rounded-xl border border-border-subtle bg-surface-card shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
                <div className="flex items-center gap-3">
                  {getFileIcon(modalContent.name, 24)}
                  <h2
                    id="document-modal-title"
                    className="text-lg font-semibold text-content-primary"
                  >
                    {modalContent.name}
                  </h2>
                </div>
                <button
                  onClick={() => setModalOpen(false)}
                  aria-label="Close"
                  className="rounded-lg p-1.5 text-content-secondary transition-colors hover:bg-surface-chat"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-6">
                <pre className="whitespace-pre-wrap font-mono text-sm text-content-primary">
                  {modalContent.content}
                </pre>
              </div>

              <div className="flex items-center justify-end border-t border-border-subtle px-6 py-4">
                <button
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-border-subtle bg-surface-chat px-4 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-chat/80"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
})
