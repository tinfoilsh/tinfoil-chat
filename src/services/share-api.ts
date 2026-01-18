import { logError } from '@/utils/error-handling'
import type { EncryptedShareData } from '@/utils/share-encryption'
import { isTokenValid } from '@/utils/token-validation'

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.tinfoil.sh'

let tokenGetter: (() => Promise<string | null>) | null = null

export function setShareApiTokenGetter(
  getToken: () => Promise<string | null>,
): void {
  tokenGetter = getToken
}

async function getAuthHeaders(): Promise<HeadersInit> {
  if (!tokenGetter) {
    throw new Error('Token getter not set')
  }

  const token = await tokenGetter()
  if (!token) {
    throw new Error('Failed to get authentication token')
  }

  if (!isTokenValid(token)) {
    throw new Error('Token is expired')
  }

  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Upload encrypted shared chat data to the server
 */
export async function uploadSharedChat(
  chatId: string,
  encryptedData: EncryptedShareData,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/shares/${chatId}`, {
    method: 'PUT',
    headers: await getAuthHeaders(),
    body: JSON.stringify(encryptedData),
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
 * Fetch encrypted shared chat data from the server
 * This endpoint is public - no authentication required
 */
export async function fetchSharedChat(
  chatId: string,
): Promise<EncryptedShareData> {
  const response = await fetch(`${API_BASE_URL}/api/shares/${chatId}`, {
    method: 'GET',
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Shared chat not found')
    }
    throw new Error(`Failed to fetch shared chat: ${response.status}`)
  }

  return response.json()
}
