import type { Attachment, Chat, Message } from '@/components/chat/types'
import { uint8ArrayToBase64 } from '@/utils/binary-codec'
import { parseTinfoilExportBytes } from './local-tinfoil-import-parser'

export const LOCAL_IMPORT_MAX_ARCHIVE_BYTES = 512 * 1024 * 1024

interface TinfoilExportedAttachment {
  id: string
  type: 'image' | 'document'
  fileName: string
  mimeType?: string
  fileSize?: number
  exportPath?: string
  textContent?: string
}

interface TinfoilExportedMessage {
  text: string
  sender: 'human' | 'assistant'
  created_at: string
  content?: Array<{
    type: string
    thinking?: string
  }>
  attachments?: TinfoilExportedAttachment[]
}

interface TinfoilExportedConversation {
  name: string
  created_at: string
  updated_at?: string
  projectId?: string
  chat_messages: TinfoilExportedMessage[]
}

export interface LocalTinfoilImportOptions {
  generateChatId: (createdAt?: Date) => string
  isCloudSyncEnabled: boolean
}

interface ImportWorkerResponse {
  ok: boolean
  conversations?: TinfoilExportedConversation[]
  entries?: Record<string, Uint8Array>
  error?: string
}

class ImportWorkerUnavailableError extends Error {}

async function readExportOnMainThread(file: File): Promise<{
  conversations: TinfoilExportedConversation[]
  entries?: Record<string, Uint8Array>
}> {
  return parseTinfoilExportBytes<TinfoilExportedConversation>({
    bytes: new Uint8Array(await file.arrayBuffer()),
    fileName: file.name,
    mimeType: file.type,
    maxArchiveBytes: LOCAL_IMPORT_MAX_ARCHIVE_BYTES,
  })
}

async function readExport(file: File): Promise<{
  conversations: TinfoilExportedConversation[]
  entries?: Record<string, Uint8Array>
}> {
  if (file.size === 0) {
    throw new Error('The export file is empty')
  }
  if (file.size > LOCAL_IMPORT_MAX_ARCHIVE_BYTES) {
    throw new Error('The export file is too large')
  }
  if (typeof Worker === 'undefined') return readExportOnMainThread(file)

  try {
    return await readExportInWorker(file)
  } catch (error) {
    if (error instanceof ImportWorkerUnavailableError) {
      return readExportOnMainThread(file)
    }
    throw error
  }
}

async function readExportInWorker(file: File): Promise<{
  conversations: TinfoilExportedConversation[]
  entries?: Record<string, Uint8Array>
}> {
  const buffer = await file.arrayBuffer()
  let worker: Worker
  try {
    worker = new Worker(
      new URL('./local-tinfoil-import.worker.ts', import.meta.url),
    )
  } catch {
    throw new ImportWorkerUnavailableError()
  }

  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<ImportWorkerResponse>) => {
      worker.terminate()
      if (
        !event.data.ok ||
        !event.data.conversations ||
        !Array.isArray(event.data.conversations)
      ) {
        reject(new Error(event.data.error ?? 'Invalid Tinfoil export format'))
        return
      }
      resolve({
        conversations: event.data.conversations,
        entries: event.data.entries,
      })
    }
    worker.onerror = () => {
      worker.terminate()
      reject(new ImportWorkerUnavailableError())
    }
    try {
      worker.postMessage(
        {
          buffer,
          fileName: file.name,
          mimeType: file.type,
          maxArchiveBytes: LOCAL_IMPORT_MAX_ARCHIVE_BYTES,
        },
        [buffer],
      )
    } catch {
      worker.terminate()
      reject(new ImportWorkerUnavailableError())
    }
  })
}

function importAttachment(
  attachment: TinfoilExportedAttachment,
  entries?: Record<string, Uint8Array>,
): Attachment {
  const imported: Attachment = {
    id: attachment.id,
    type: attachment.type,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    textContent: attachment.textContent,
  }

  if (attachment.type === 'image' && attachment.exportPath) {
    const bytes = entries?.[attachment.exportPath]
    if (!bytes) {
      throw new Error(`The export is missing ${attachment.exportPath}`)
    }
    imported.base64 = uint8ArrayToBase64(bytes)
    imported.fileSize = bytes.byteLength
  }

  return imported
}

export async function parseLocalTinfoilExport(
  file: File,
  options: LocalTinfoilImportOptions,
): Promise<Chat[]> {
  const { conversations, entries } = await readExport(file)
  const chats: Chat[] = []

  for (const conversation of conversations) {
    const messages: Message[] = []

    for (const exportedMessage of conversation.chat_messages ?? []) {
      const content = exportedMessage.text?.trim() ?? ''
      const attachments = (exportedMessage.attachments ?? []).map(
        (attachment) => importAttachment(attachment, entries),
      )
      if (!content && attachments.length === 0) continue

      const message: Message = {
        role: exportedMessage.sender === 'human' ? 'user' : 'assistant',
        content,
        timestamp: new Date(exportedMessage.created_at),
      }
      if (attachments.length > 0) {
        message.attachments = attachments
      }

      if (message.role === 'assistant') {
        const thoughts = (exportedMessage.content ?? [])
          .filter((block) => block.type === 'thinking' && block.thinking)
          .map((block) => block.thinking)
          .join('\n\n')
        if (thoughts) {
          message.thoughts = thoughts
        }
      }

      messages.push(message)
    }

    if (messages.length > 0) {
      const createdAt = new Date(conversation.created_at)
      // Local import does not restore projects, and the sidebar hides
      // chats whose projectId has no matching project, so drop the
      // exported project association.
      chats.push({
        id: options.generateChatId(createdAt),
        title: conversation.name || 'Imported Chat',
        messages,
        createdAt,
        updatedAt: conversation.updated_at,
        isLocalOnly: !options.isCloudSyncEnabled,
      })
    }
  }

  return chats
}
