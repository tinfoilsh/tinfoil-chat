/**
 * Image preprocessing utilities for document upload
 */

interface ImageScaleOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
}

/**
 * Scales down an image to fit within specified dimensions while maintaining aspect ratio
 * @param file - The image file to scale
 * @param options - Scaling options (maxWidth, maxHeight, quality)
 * @returns A promise that resolves to a scaled image blob
 */
export async function scaleImage(
  file: File,
  options: ImageScaleOptions = {},
): Promise<Blob> {
  const { maxWidth = 1920, maxHeight = 1080, quality = 0.9 } = options

  return new Promise((resolve, reject) => {
    const img = new Image()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      reject(new Error('Failed to get canvas context'))
      return
    }

    img.onload = () => {
      // Calculate new dimensions
      let width = img.width
      let height = img.height

      if (width > maxWidth || height > maxHeight) {
        const widthRatio = maxWidth / width
        const heightRatio = maxHeight / height
        const ratio = Math.min(widthRatio, heightRatio)

        width = Math.floor(width * ratio)
        height = Math.floor(height * ratio)
      }

      // Set canvas dimensions
      canvas.width = width
      canvas.height = height

      // Draw scaled image
      ctx.drawImage(img, 0, 0, width, height)

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Failed to convert canvas to blob'))
          }
        },
        file.type,
        quality,
      )
    }

    img.onerror = () => {
      reject(new Error('Failed to load image'))
    }

    // Read the image file
    const reader = new FileReader()
    reader.onload = (e) => {
      if (e.target?.result) {
        img.src = e.target.result as string
      }
    }
    reader.onerror = () => {
      reject(new Error('Failed to read image file'))
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Checks if a file is an image based on its MIME type
 * @param file - The file to check
 * @returns true if the file is an image, false otherwise
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}
