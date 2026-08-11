import {
  fetchFavicon,
  fetchLinkMetadata,
  resetMetadataClient,
} from '@/services/inference/metadata-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    resetMetadataClient()
    mockFetch.mockReset().mockResolvedValue(faviconResponse())
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

  it('accepts new found and missing response shapes with empty fields', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'found',
            favicon_bytes: 'aWNvbg==',
            favicon_content_type: '',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'missing',
            favicon_bytes: '',
            favicon_content_type: '',
          }),
          { status: 200 },
        ),
      )

    await expect(fetchFavicon('https://found.example/page')).resolves.toBe(
      'data:image/x-icon;base64,aWNvbg==',
    )
    await expect(
      fetchFavicon('https://missing.example/page'),
    ).resolves.toBeNull()
  })

  it('uses canonical URL and host cache keys', async () => {
    await fetchFavicon(' HTTPS://EXAMPLE.NET/path#fragment ')
    await fetchFavicon('https://example.net/other')

    expect(mockFetch).toHaveBeenCalledOnce()
    expect(mockFetch.mock.calls[0][1]?.body).toBe(
      JSON.stringify({ url: 'https://example.net/path' }),
    )
  })

  it('caches structured transient failures with escalating cooldowns', async () => {
    let now = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'temporarily unavailable',
          code: 'UPSTREAM_TIMEOUT',
          retryable: true,
        }),
        { status: 503 },
      ),
    )

    await expect(
      fetchFavicon('https://cooldown.example'),
    ).rejects.toMatchObject({
      kind: 'transient',
      code: 'UPSTREAM_TIMEOUT',
    })
    await expect(
      fetchFavicon('https://cooldown.example'),
    ).rejects.toMatchObject({
      kind: 'transient',
    })
    expect(mockFetch).toHaveBeenCalledOnce()

    now += 60_001
    await expect(fetchFavicon('https://cooldown.example')).rejects.toBeDefined()
    now += 60_001
    await expect(fetchFavicon('https://cooldown.example')).rejects.toBeDefined()
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('validates and trims metadata responses at runtime', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          url: 'https://metadata.example',
          title: '  Example title  ',
          description: '   ',
          site_name: ' Example ',
          image: '',
          cached: false,
        }),
        { status: 200 },
      ),
    )
    await expect(
      fetchLinkMetadata('https://metadata.example#section'),
    ).resolves.toEqual({
      url: 'https://metadata.example/',
      title: 'Example title',
      description: null,
      siteName: 'Example',
      image: null,
      cached: false,
    })

    resetMetadataClient()
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ title: 42 }), { status: 200 }),
    )
    await expect(
      fetchLinkMetadata('https://invalid.example'),
    ).rejects.toMatchObject({ kind: 'validation', code: 'INVALID_RESPONSE' })
  })

  it('does not let a pre-reset request repopulate or clear the new cache', async () => {
    let resolveOld!: (response: Response) => void
    let resolveCurrent!: (response: Response) => void
    mockFetch
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveOld = resolve
        }),
      )
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveCurrent = resolve
        }),
      )

    const oldRequest = fetchFavicon('https://reset.example/old')
    resetMetadataClient()
    const currentRequest = fetchFavicon('https://reset.example/current')
    expect(fetchFavicon('https://reset.example/again')).toBe(currentRequest)

    resolveOld(faviconResponse())
    await oldRequest
    expect(fetchFavicon('https://reset.example/newer')).toBe(currentRequest)

    resolveCurrent(faviconResponse())
    await expect(currentRequest).resolves.toContain('data:image/x-icon')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
