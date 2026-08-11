import {
  fetchFavicon,
  fetchLinkMetadata,
} from '@/services/inference/metadata-client'
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
      status: 'found',
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

  it('returns null when the enclave reports a missing favicon', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'missing',
          favicon_bytes: '',
          favicon_content_type: '',
        }),
        { status: 200 },
      ),
    )

    await expect(fetchFavicon('https://missing.example')).resolves.toBeNull()
  })

  it('rejects found responses without valid image data', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'found',
          favicon_bytes: '',
          favicon_content_type: 'text/plain',
        }),
        { status: 200 },
      ),
    )

    await expect(fetchFavicon('https://invalid.example')).rejects.toThrow(
      'Invalid found favicon response',
    )
  })

  it('does not cache transient failures', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(faviconResponse())

    await expect(fetchFavicon('https://transient.example')).rejects.toThrow(
      'Favicon fetch failed: 503',
    )
    await expect(fetchFavicon('https://transient.example')).resolves.toBe(
      'data:image/x-icon;base64,aWNvbg==',
    )
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})

describe('fetchLinkMetadata', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('maps metadata responses', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          url: 'https://example.com/',
          title: 'Example',
          description: null,
          site_name: 'Example Site',
          image: null,
          cached: false,
        }),
        { status: 200 },
      ),
    )

    await expect(fetchLinkMetadata('https://example.com/')).resolves.toEqual({
      url: 'https://example.com/',
      title: 'Example',
      description: null,
      siteName: 'Example Site',
      image: null,
      cached: false,
    })
  })

  it('rejects non-success responses', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('unavailable', { status: 502 }),
    )

    await expect(fetchLinkMetadata('https://failure.example/')).rejects.toThrow(
      'Metadata fetch failed: 502',
    )
  })
})
