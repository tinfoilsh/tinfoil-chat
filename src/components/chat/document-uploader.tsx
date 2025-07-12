import { getAIModels, type BaseModel } from '@/app/config/models'
import { logError } from '@/utils/error-handling'
import { useState } from 'react'
import { CONSTANTS } from './constants'
import type { DocumentProcessingResult } from './types'

/**
 * Determine the file type for icon display
 */
export const getFileIconType = (filename: string): string => {
  const lowerFilename = filename.toLowerCase()

  if (lowerFilename.endsWith('.pdf')) return 'pdf'
  if (lowerFilename.endsWith('.doc') || lowerFilename.endsWith('.docx'))
    return 'docx'
  if (lowerFilename.endsWith('.ppt') || lowerFilename.endsWith('.pptx'))
    return 'pptx'
  if (lowerFilename.endsWith('.xls') || lowerFilename.endsWith('.xlsx'))
    return 'xlsx'
  if (lowerFilename.endsWith('.csv')) return 'csv'

  if (
    lowerFilename.endsWith('.jpg') ||
    lowerFilename.endsWith('.jpeg') ||
    lowerFilename.endsWith('.png') ||
    lowerFilename.endsWith('.gif')
  )
    return 'image'

  if (
    lowerFilename.endsWith('.mp3') ||
    lowerFilename.endsWith('.wav') ||
    lowerFilename.endsWith('.ogg')
  )
    return 'audio'

  if (
    lowerFilename.endsWith('.mp4') ||
    lowerFilename.endsWith('.mov') ||
    lowerFilename.endsWith('.avi')
  )
    return 'video'

  if (
    lowerFilename.endsWith('.zip') ||
    lowerFilename.endsWith('.rar') ||
    lowerFilename.endsWith('.tar')
  )
    return 'zip'

  if (lowerFilename.endsWith('.html') || lowerFilename.endsWith('.htm'))
    return 'html'
  if (lowerFilename.endsWith('.js') || lowerFilename.endsWith('.jsx'))
    return 'js'
  if (lowerFilename.endsWith('.ts') || lowerFilename.endsWith('.tsx'))
    return 'ts'
  if (lowerFilename.endsWith('.css')) return 'css'
  if (lowerFilename.endsWith('.md')) return 'md'
  if (lowerFilename.endsWith('.txt')) return 'txt'

  // Default
  return 'file'
}

/**
 * Handles the document upload and processing logic
 */
export const useDocumentUploader = (
  isPremium?: boolean,
  selectedModelDetails?: BaseModel,
) => {
  const [uploadingDocuments, setUploadingDocuments] = useState<
    Record<string, boolean>
  >({})

  // Get a unique ID for the document
  const getDocumentId = () => Math.random().toString(36).substring(2, 9)

  // Get docling model from config
  const getDoclingModel = async (): Promise<{
    endpoint: string
    modelName: string
  }> => {
    try {
      // Try to get models based on user's subscription status
      const models = await getAIModels(isPremium ?? false)
      const doclingModel = models.find(
        (model) => model.modelName === 'docling' || model.type === 'document',
      )

      if (doclingModel?.endpoint) {
        return {
          endpoint: doclingModel.endpoint,
          modelName: doclingModel.modelName,
        }
      }

      // If not found, throw error - no fallbacks
      throw new Error('Document processing model not found in configuration')
    } catch (error) {
      logError('Failed to fetch docling model configuration', error, {
        component: 'DocumentUploader',
        action: 'getDoclingModel',
      })
      throw error
    }
  }

  // Determine the format based on file extension
  const getFormatFromFileType = (file: File): string => {
    const filename = file.name.toLowerCase()

    if (filename.endsWith('.pdf')) return 'pdf'
    if (filename.endsWith('.docx')) return 'docx'
    if (filename.endsWith('.pptx')) return 'pptx'
    if (filename.endsWith('.html') || filename.endsWith('.htm')) return 'html'
    if (filename.endsWith('.md')) return 'md'
    if (filename.endsWith('.csv')) return 'csv'
    if (filename.endsWith('.xlsx')) return 'xlsx'
    if (
      filename.endsWith('.jpg') ||
      filename.endsWith('.jpeg') ||
      filename.endsWith('.png') ||
      filename.endsWith('.gif')
    )
      return 'image'
    if (filename.endsWith('.txt')) return 'asciidoc' // Treat text as asciidoc

    // Default to pdf if we can't determine
    return 'pdf'
  }

  // Handle text files directly in the browser
  const handleTextFile = async (file: File): Promise<string> => {
    // Use FileReader to read the file contents
    const reader = new FileReader()

    // Create a promise to handle the async FileReader
    const fileContents = await new Promise<string>((resolve, reject) => {
      reader.onload = (e) => {
        if (e.target?.result) {
          resolve(e.target.result as string)
        } else {
          reject(new Error('Failed to read file contents'))
        }
      }
      reader.onerror = () => reject(new Error('Error reading file'))
      reader.readAsText(file)
    })

    // Format the content
    return `# ${file.name}\n\n${fileContents}`
  }

  // Check if file is an image type
  const isImageFile = (file: File): boolean => {
    const filename = file.name.toLowerCase()
    return (
      filename.endsWith('.jpg') ||
      filename.endsWith('.jpeg') ||
      filename.endsWith('.png') ||
      filename.endsWith('.gif') ||
      filename.endsWith('.webp') ||
      filename.endsWith('.bmp') ||
      filename.endsWith('.tiff')
    )
  }

  // Convert image file to base64
  const fileToBase64 = async (file: File): Promise<string> => {
    const reader = new FileReader()

    return new Promise<string>((resolve, reject) => {
      reader.onload = (e) => {
        if (e.target?.result) {
          const base64String = e.target.result as string
          // Remove the data URL prefix to get just the base64 data
          const base64Data = base64String.split(',')[1]
          resolve(base64Data)
        } else {
          reject(new Error('Failed to convert file to base64'))
        }
      }
      reader.onerror = () =>
        reject(new Error('Error reading file for base64 conversion'))
      reader.readAsDataURL(file)
    })
  }

  // Get MIME type for image files
  const getImageMimeType = (file: File): string => {
    const filename = file.name.toLowerCase()
    if (filename.endsWith('.jpg') || filename.endsWith('.jpeg'))
      return 'image/jpeg'
    if (filename.endsWith('.png')) return 'image/png'
    if (filename.endsWith('.gif')) return 'image/gif'
    if (filename.endsWith('.webp')) return 'image/webp'
    if (filename.endsWith('.bmp')) return 'image/bmp'
    if (filename.endsWith('.tiff')) return 'image/tiff'
    // Default fallback
    return 'image/jpeg'
  }

  // Main upload function
  const handleDocumentUpload = async (
    file: File,
    onSuccess: (
      content: string,
      documentId: string,
      imageData?: { base64: string; mimeType: string },
    ) => void,
    onError: (error: Error, documentId: string) => void,
  ) => {
    const documentId = getDocumentId()

    try {
      // Add this document to uploading state
      setUploadingDocuments((prev) => ({
        ...prev,
        [documentId]: true,
      }))

      // Check file size
      if (file.size > CONSTANTS.MAX_DOCUMENT_SIZE_BYTES) {
        onError(
          new Error(
            `File size exceeds the limit of ${CONSTANTS.MAX_DOCUMENT_SIZE_MB}MB.`,
          ),
          documentId,
        )
        return
      }

      // Handle .txt files directly in the browser
      if (file.name.toLowerCase().endsWith('.txt')) {
        const formattedContent = await handleTextFile(file)
        onSuccess(formattedContent, documentId)
        return
      }

      // For image files, we need to handle both OCR and base64 encoding
      const isImage = isImageFile(file)
      let imageData: { base64: string; mimeType: string } | undefined

      if (isImage && selectedModelDetails?.multimodal) {
        // Only generate base64 data if the selected model supports multimodal
        const base64Data = await fileToBase64(file)
        const mimeType = getImageMimeType(file)
        imageData = { base64: base64Data, mimeType }
      }

      // For non-txt files, proceed with API processing
      // Create a FormData object for the file
      const formData = new FormData()

      // Add the file - make sure it's correctly named as expected by the API
      formData.append('files', file)

      // Add essential parameters - ensure they're formatted as arrays if needed
      formData.append('to_formats[]', 'md')
      formData.append('from_formats[]', getFormatFromFileType(file))
      formData.append('pipeline', 'standard')
      formData.append('return_as_file', 'false')

      // Add parameters to control image handling
      formData.append('include_images', 'false')
      formData.append('do_picture_classification', 'false')
      formData.append('do_picture_description', 'false')
      formData.append('image_export_mode', 'placeholder') // Use placeholder instead of skip for images

      const { endpoint, modelName } = await getDoclingModel()

      // Use the proxy
      const proxyUrl = `${CONSTANTS.INFERENCE_PROXY_URL}${endpoint}`

      // Add model parameter to formData
      formData.append('model', modelName)

      const response = await fetch(proxyUrl, {
        method: 'POST',
        body: formData,
      })

      // Check if submission successful
      if (!response.ok) {
        const errorText = await response.text()
        logError(
          `Document upload failed with status: ${response.status}`,
          undefined,
          {
            component: 'DocumentUploader',
            action: 'uploadDocument',
            metadata: { status: response.status, errorText },
          },
        )

        // Special handling for 404 errors, which might mean we need to retry or use another approach
        if (response.status === 404) {
          throw new Error(
            `API endpoint not found or not accessible. Please check the API URL.`,
          )
        } else {
          throw new Error(
            `Document upload failed with status: ${response.status}. ${errorText}`,
          )
        }
      }

      // Process the direct response
      const processingResult =
        (await response.json()) as DocumentProcessingResult

      if (processingResult.document && processingResult.document.md_content) {
        // Pass the content and image data if it's an image
        onSuccess(processingResult.document.md_content, documentId, imageData)
      } else {
        throw new Error('No document content received')
      }
    } catch (error) {
      logError('Document processing failed', error, {
        component: 'DocumentUploader',
        action: 'uploadDocument',
        metadata: { fileName: file.name },
      })
      onError(
        error instanceof Error
          ? error
          : new Error('Unknown error during document processing'),
        documentId,
      )
    } finally {
      // Remove this document from uploading state
      setUploadingDocuments((prev) => {
        const newState = { ...prev }
        delete newState[documentId]
        return newState
      })
    }
  }

  return {
    handleDocumentUpload,
    uploadingDocuments,
    isDocumentUploading: Object.keys(uploadingDocuments).length > 0,
  }
}
