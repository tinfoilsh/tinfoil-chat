import { logError } from '@/utils/error-handling'
import type { EncryptedShareData } from '@/utils/share-encryption'
import { authTokenManager } from './auth'

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.tinfoil.sh'

async function getAuthHeaders(): Promise<HeadersInit> {
  return authTokenManager.getAuthHeaders()
}

/**
 * Fetched share data — either v0 JSON or v1 raw binary.
 */
export type FetchedShareData =
  | { formatVersion: 0; data: EncryptedShareData }
  | { formatVersion: 1; binary: ArrayBuffer }

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
      'X-Format-Version': '1',
    },
    body: encryptedData,
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
 * Fetch encrypted shared chat data from the server.
 * Returns v0 JSON or v1 binary based on X-Format-Version header.
 */
export async function fetchSharedChat(
  chatId: string,
): Promise<FetchedShareData> {
  const response = await fetch(`${API_BASE_URL}/api/shares/${chatId}`, {
    method: 'GET',
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Shared chat not found')
    }
    throw new Error(`Failed to fetch shared chat: ${response.status}`)
  }

  const formatVersion = parseInt(
    response.headers.get('X-Format-Version') || '0',
    10,
  )

  if (formatVersion === 1) {
    const binary = await response.arrayBuffer()
    return { formatVersion: 1, binary }
  }

  const data: EncryptedShareData = await response.json()
  return { formatVersion: 0, data }
}
