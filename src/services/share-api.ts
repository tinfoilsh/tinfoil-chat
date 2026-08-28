import { logError } from '@/utils/error-handling'
import { authTokenManager } from './auth'

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.tinfoil.sh'

export const SHARE_STORAGE_FORMAT_HEADER = 'X-Format-Version'
export const SHARE_STORAGE_FORMAT_VERSION = '1'
export const SHARE_FORMAT_VERSION = 1 as const

async function getAuthHeaders(): Promise<Record<string, string>> {
  return authTokenManager.getAuthHeaders()
}

export type FetchedShareData = {
  formatVersion: typeof SHARE_FORMAT_VERSION
  binary: ArrayBuffer
}

export class SharedChatNotFoundError extends Error {}

export class UnsupportedShareFormatError extends Error {}

/**
 * Upload v1 binary encrypted shared chat data to the server.
 */
export async function uploadSharedChat(
  chatId: string,
  encryptedData: Uint8Array,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/shares/${chatId}`, {
    method: 'PUT',
    headers: {
      ...(await getAuthHeaders()),
      'Content-Type': 'application/octet-stream',
      [SHARE_STORAGE_FORMAT_HEADER]: SHARE_STORAGE_FORMAT_VERSION,
    },
    body: encryptedData as unknown as BodyInit,
  })

  if (!response.ok) {
    const error = new Error(`Failed to upload shared chat: ${response.status}`)
    logError('Failed to upload shared chat', error, {
      component: 'ShareApi',
      action: 'uploadSharedChat',
      metadata: { chatId, status: response.status },
    })
    throw error
  }
}

/**
 * Fetch v1 binary encrypted shared chat data from the server.
 */
export async function fetchSharedChat(
  chatId: string,
): Promise<FetchedShareData> {
  const response = await fetch(`${API_BASE_URL}/api/shares/${chatId}`, {
    method: 'GET',
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new SharedChatNotFoundError('Shared chat not found')
    }
    throw new Error(`Failed to fetch shared chat: ${response.status}`)
  }

  if (
    response.headers.get(SHARE_STORAGE_FORMAT_HEADER) !==
    SHARE_STORAGE_FORMAT_VERSION
  ) {
    throw new UnsupportedShareFormatError('Unsupported share storage format')
  }

  const binary = await response.arrayBuffer()
  return { formatVersion: SHARE_FORMAT_VERSION, binary }
}
