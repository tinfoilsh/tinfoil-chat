import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'

const plausibleScript = readFileSync(
  resolve(process.cwd(), 'public/js/plausible.js'),
  'utf8',
)

type Plausible = (eventName: string, options?: object) => void

function loadPlausible(url: string) {
  const parsedUrl = new URL(url)
  const location = {
    href: parsedUrl.href,
    hostname: parsedUrl.hostname,
    pathname: parsedUrl.pathname,
    protocol: parsedUrl.protocol,
  }
  const fetchMock = vi.fn().mockResolvedValue({ status: 202 })
  const windowMock: {
    addEventListener: ReturnType<typeof vi.fn>
    fetch: typeof fetchMock
    history: {
      pushState: (
        data: unknown,
        unused: string,
        url?: string | URL | null,
      ) => void
    }
    localStorage: object
    navigator: { webdriver: boolean }
    plausible?: Plausible
  } = {
    addEventListener: vi.fn(),
    fetch: fetchMock,
    history: {
      pushState: vi.fn(),
    },
    localStorage: {},
    navigator: {
      webdriver: false,
    },
  }
  const documentMock = {
    addEventListener: vi.fn(),
    body: {},
    currentScript: {
      getAttribute: (name: string) => {
        if (name === 'data-api') return 'https://plausible.io/api/event'
        if (name === 'data-domain') return 'chat.tinfoil.sh'
        return null
      },
      src: 'https://chat.tinfoil.sh/js/plausible.js',
    },
    documentElement: {
      clientHeight: 800,
    },
    hasFocus: () => true,
    referrer: '',
    visibilityState: 'visible',
  }

  runInNewContext(plausibleScript, {
    URL,
    console,
    document: documentMock,
    fetch: fetchMock,
    location,
    setInterval,
    window: windowMock,
  })

  return {
    fetchMock,
    history: windowMock.history,
    location,
    plausible: windowMock.plausible,
  }
}

describe('Plausible analytics', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not send events from shared chat URLs', () => {
    const analytics = loadPlausible(
      'https://chat.tinfoil.sh/share/chat-id#v2:throwaway-key',
    )

    analytics.plausible?.('Share Viewed')

    expect(analytics.fetchMock).not.toHaveBeenCalled()
  })

  it('stops sending events after navigating to a shared chat URL', () => {
    const analytics = loadPlausible('https://chat.tinfoil.sh/chat/local/id')
    expect(analytics.fetchMock).toHaveBeenCalledTimes(1)

    analytics.location.href =
      'https://chat.tinfoil.sh/share/chat-id#v2:throwaway-key'
    analytics.location.pathname = '/share/chat-id'
    analytics.history.pushState({}, '', '/share/chat-id')

    expect(analytics.fetchMock).toHaveBeenCalledTimes(1)
  })

  it('continues sending pageviews from non-share routes', () => {
    const analytics = loadPlausible('https://chat.tinfoil.sh/shared')

    expect(analytics.fetchMock).toHaveBeenCalledTimes(1)
    const request = analytics.fetchMock.mock.calls[0][1]
    const body = JSON.parse(String(request.body)) as { u: string }
    expect(body.u).toBe('https://chat.tinfoil.sh/shared')
  })
})
