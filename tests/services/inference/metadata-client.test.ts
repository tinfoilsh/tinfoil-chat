import { fetchFavicon } from '@/services/inference/metadata-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(),
}))

vi.mock('tinfoil', () => ({
  SecureClient: class {
    fetch = mockFetch
  },
}))

function faviconResponse(): Response {
  return new Response(
    JSON.stringify({
      favicon_bytes: 'aWNvbg==',
      favicon_content_type: 'image/x-icon',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

describe('fetchFavicon', () => {
  beforeEach(() => {
    mockFetch.mockReset().mockResolvedValue(faviconResponse())
  })

  it('uses the favicon-only enclave endpoint', async () => {
    await expect(fetchFavicon('https://example.com/page')).resolves.toBe(
      'data:image/x-icon;base64,aWNvbg==',
    )
    expect(mockFetch).toHaveBeenCalledWith(
      'https://opengraph-metadata.tinfoil.sh/favicon',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com/page' }),
      }),
    )
  })

  it('deduplicates concurrent requests for the same hostname', async () => {
    const first = fetchFavicon('https://example.org/one')
    const second = fetchFavicon('https://example.org/two')

    await Promise.all([first, second])
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
