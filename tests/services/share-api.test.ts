import {
  fetchSharedChat,
  SharedChatNotFoundError,
  UnsupportedShareFormatError,
} from '@/services/share-api'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/auth', () => ({
  authTokenManager: { getAuthHeaders: vi.fn() },
}))

describe('fetchSharedChat', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('accepts storage format 1 as binary', async () => {
    const binary = new Uint8Array([1, 2, 3]).buffer
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(binary, {
        headers: { 'X-Format-Version': '1' },
      }),
    )

    await expect(fetchSharedChat('chat-id')).resolves.toEqual({
      formatVersion: 1,
      binary,
    })
  })

  it.each([null, '0', '2', '1.0', 'invalid'])(
    'rejects storage format %s',
    async (formatVersion) => {
      const headers = new Headers()
      if (formatVersion !== null) {
        headers.set('X-Format-Version', formatVersion)
      }
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{}', { headers }),
      )

      await expect(fetchSharedChat('chat-id')).rejects.toBeInstanceOf(
        UnsupportedShareFormatError,
      )
    },
  )

  it('classifies missing shares', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 404 }),
    )

    await expect(fetchSharedChat('chat-id')).rejects.toBeInstanceOf(
      SharedChatNotFoundError,
    )
  })
})
