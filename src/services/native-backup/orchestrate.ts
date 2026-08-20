import type { Chat } from '@/components/chat/types'
import { runOffDeviceImport } from '@/services/chat-import/off-device-import'
import { chatStorage } from '@/services/storage/chat-storage'
// prettier-ignore
import { importStatus,type ImportStatusResponse } from '@/services/sync-enclave/sync-api'
import { uint8ArrayToBase64 } from '@/utils/binary-codec'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import {
  forEachNativeBackupLocalImage,
  validateAndPackageNativeBackup,
  type ValidatedNativeRestore,
} from './restore'
import type { NativeBackupImage } from './schemas'

const POLL_INTERVAL_MS = 1500
const MAX_POLL_ATTEMPTS = 20
// prettier-ignore
export const NATIVE_RESTORE_KINDS = ['projects', 'project_documents', 'cloud_chats', 'local_chats', 'attachments'] as const
export type NativeRestoreKind = (typeof NATIVE_RESTORE_KINDS)[number]
// prettier-ignore
export type NativeRestoreCount = { imported: number; skipped: number; failed: number; blocked: number; warnings: string[]; errors: string[] }
// prettier-ignore
export type NativeRestoreResult = { state: 'completed' | 'partial' | 'failed' | 'pending'; jobId?: string; report: Record<NativeRestoreKind, NativeRestoreCount> }
// prettier-ignore
type Dependencies = { validate: typeof validateAndPackageNativeBackup; upload: typeof runOffDeviceImport; status: typeof importStatus; forEachImage: typeof forEachNativeBackupLocalImage; getChat(id: string): Promise<Chat | null>; saveChat(chat: Chat, skipCloudSync?: boolean): Promise<Chat | null>; wait(ms: number, signal: AbortSignal): Promise<void> }
// prettier-ignore
type RestoreEvents = { onStarted?(status: ImportStatusResponse): void; onPhase?(phase?: string): void }

const defaults: Dependencies = {
  validate: validateAndPackageNativeBackup,
  upload: runOffDeviceImport,
  status: importStatus,
  forEachImage: forEachNativeBackupLocalImage,
  getChat: chatStorage.getChat.bind(chatStorage),
  saveChat: chatStorage.saveChatIfAllowed.bind(chatStorage),
  wait: (ms, signal) => {
    signal.throwIfAborted()
    return new Promise((resolve, reject) => {
      const complete = () => {
        signal.removeEventListener('abort', abort)
        resolve()
      }
      const abort = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        reject(signal.reason)
      }
      const timer = window.setTimeout(complete, ms)
      signal.addEventListener('abort', abort, { once: true })
    })
  },
}

function emptyReport(): NativeRestoreResult['report'] {
  // prettier-ignore
  return Object.fromEntries(
    NATIVE_RESTORE_KINDS.map((kind) => [kind, { imported: 0, skipped: 0, failed: 0, blocked: 0, warnings: [], errors: [] }]),
  ) as unknown as NativeRestoreResult['report']
}

// prettier-ignore
function destinationChatId(ownerId: string, backupId: string, sourceId: string) {
  const input = new TextEncoder().encode(`${ownerId}\0${backupId}\0${sourceId}`)
  return `native-${bytesToHex(sha256(input))}`
}

function applyImage(chat: Chat, image: NativeBackupImage, bytes: Uint8Array) {
  const message = chat.messages[image.messageIndex]
  const base64 = uint8ArrayToBase64(bytes)
  if (image.legacyIndex !== undefined) {
    message.imageData![image.legacyIndex] = { base64, mimeType: image.mimeType }
    return
  }
  const index =
    message.attachments?.findIndex(({ id }) => id === image.attachmentId) ?? -1
  const attachment = message.attachments?.[index]
  if (!attachment) throw new Error('Backup image attachment is missing')
  if (image.page !== undefined) {
    const page = attachment.pages?.find(({ page }) => page === image.page)
    if (!page) throw new Error('Backup image page is missing')
    page.image = base64
  } else {
    // prettier-ignore
    message.attachments![index] = { id: attachment.id, type: 'image', fileName: image.fileName, mimeType: image.mimeType, fileSize: image.sizeBytes, description: image.description, base64 }
  }
}

function applyCloudReport(
  status: ImportStatusResponse,
  report: NativeRestoreResult['report'],
) {
  // prettier-ignore
  const aliases: Record<string, NativeRestoreKind> = { project: 'projects', document: 'project_documents', chat: 'cloud_chats' }
  for (const [kind, outcome] of Object.entries(status.counts ?? {})) {
    const target = aliases[kind]
    if (target) Object.assign(report[target], outcome)
  }
  report.attachments.warnings.push(...(status.warnings ?? []))
  report.cloud_chats.errors.push(...(status.errors ?? []))
  if (status.status === 'failed' && !status.counts)
    report.cloud_chats.failed = status.failed
}

async function restoreLocalChats(
  validated: ValidatedNativeRestore,
  ownerId: string,
  projectMap: Record<string, string>,
  report: NativeRestoreResult['report'],
  signal: AbortSignal,
  dependencies: Dependencies,
) {
  for (const source of validated.local.chats) {
    signal.throwIfAborted()
    const id = destinationChatId(ownerId, validated.backup.backup_id, source.id)
    const existing = await dependencies.getChat(id)
    if (existing) {
      const bucket = existing.syncUserId === ownerId ? 'skipped' : 'blocked'
      report.local_chats[bucket]++
      // prettier-ignore
      report.attachments[bucket] += validated.local.images.filter(({ metadata }) => metadata.chatId === source.id).length
      continue
    }
    let projectId = source.projectId ? projectMap[source.projectId] : undefined
    if (source.projectId && !projectId) {
      report.local_chats.warnings.push(
        `Restored "${source.title}" without its unavailable project.`,
      )
      projectId = undefined
    }
    const sourceImages = validated.local.images.filter(
      ({ metadata }) => metadata.chatId === source.id,
    )
    try {
      const chat = {
        ...source,
        id,
        projectId,
        // prettier-ignore
        messages: source.messages.map((message) => ({ ...message, timestamp: new Date(message.timestamp), attachments: message.attachments?.map((attachment) => attachment.type === 'document' ? { ...attachment, pages: attachment.pages?.map(({ imageId: _imageId, ...page }) => ({ ...page, image: '' })) } : attachment) })),
        createdAt: new Date(source.createdAt),
        isLocalOnly: true,
        syncUserId: ownerId,
      } as unknown as Chat
      // prettier-ignore
      await dependencies.forEachImage(sourceImages, ({ metadata, bytes }) => applyImage(chat, metadata, bytes), { signal })
      if (!(await dependencies.saveChat(chat, true)))
        throw new Error('Restored chat was not saved')
      report.local_chats.imported++
      report.attachments.imported += sourceImages.length
    } catch {
      signal.throwIfAborted()
      report.local_chats.failed++
      report.attachments.failed += sourceImages.length
    }
  }
}

export async function restoreNativeBackup(
  file: File,
  ownerId: string,
  signal: AbortSignal,
  events: RestoreEvents = {},
  dependencies: Dependencies = defaults,
): Promise<NativeRestoreResult> {
  if (!ownerId.trim()) throw new Error('Sign in before restoring a backup')
  const report = emptyReport()
  const validated = await dependencies.validate(file, { signal })
  let status: ImportStatusResponse | null = null
  let jobId: string | undefined
  if (validated.cloud) {
    const { upload } = validated.cloud
    try {
      // prettier-ignore
      const packageFile = upload.kind === 'blob' ? new File([upload.blob], upload.filename, { type: 'application/zip' }) : await upload.handle.getFile()
      const started = await dependencies.upload('tinfoil_backup', packageFile, {
        signal,
      })
      jobId = started.jobId
      status = started.status
      events.onStarted?.(status)
      events.onPhase?.(status.phase)
      for (
        let attempt = 0;
        status.status !== 'completed' &&
        status.status !== 'failed' &&
        attempt < MAX_POLL_ATTEMPTS;
        attempt++
      ) {
        await dependencies.wait(POLL_INTERVAL_MS, signal)
        status = await dependencies.status(jobId, signal)
        events.onPhase?.(status.phase)
      }
    } finally {
      if (upload.kind === 'file') await upload.cleanup()
    }
    applyCloudReport(status!, report)
    if (status!.status !== 'completed' && status!.status !== 'failed')
      return { state: 'pending', jobId, report }
    if (status!.status === 'failed') return { state: 'failed', jobId, report }
  }
  await restoreLocalChats(
    validated,
    ownerId,
    status?.project_mappings ?? {},
    report,
    signal,
    dependencies,
  )
  const partial = Object.values(report).some(
    ({ failed, blocked, warnings, errors }) =>
      failed || blocked || warnings.length || errors.length,
  )
  return { state: partial ? 'partial' : 'completed', jobId, report }
}
