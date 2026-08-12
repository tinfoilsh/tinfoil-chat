import { strFromU8, unzipSync } from 'fflate'

interface ImportWorkerRequest {
  buffer: ArrayBuffer
  fileName: string
  mimeType: string
  maxArchiveBytes: number
}

interface ImportWorkerScope {
  onmessage: ((event: MessageEvent<ImportWorkerRequest>) => void) | null
  postMessage(message: unknown, transfer: Transferable[]): void
}

const workerScope = globalThis as unknown as ImportWorkerScope

workerScope.onmessage = (event) => {
  try {
    const { buffer, fileName, mimeType, maxArchiveBytes } = event.data
    const bytes = new Uint8Array(buffer)
    const isZip =
      fileName.toLowerCase().endsWith('.zip') || mimeType === 'application/zip'

    if (!isZip) {
      const conversations = JSON.parse(new TextDecoder().decode(bytes))
      workerScope.postMessage({ ok: true, conversations }, [])
      return
    }

    let uncompressedBytes = 0
    const entries = unzipSync(bytes, {
      filter: (entry) => {
        const isImportEntry =
          entry.name === 'conversations.json' ||
          entry.name === 'manifest.json' ||
          entry.name.startsWith('attachments/')
        if (!isImportEntry) return false

        uncompressedBytes += entry.originalSize
        if (uncompressedBytes > maxArchiveBytes) {
          throw new Error('The uncompressed export is too large')
        }
        return true
      },
    })
    const conversationsEntry = entries['conversations.json']
    if (!conversationsEntry) {
      throw new Error('The Tinfoil export is missing conversations.json')
    }

    const conversations = JSON.parse(strFromU8(conversationsEntry))
    const transfer = Object.values(entries)
      .map((entry) => entry.buffer)
      .filter((entry): entry is ArrayBuffer => entry instanceof ArrayBuffer)
    workerScope.postMessage({ ok: true, conversations, entries }, transfer)
  } catch (error) {
    workerScope.postMessage(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to read export',
      },
      [],
    )
  }
}
