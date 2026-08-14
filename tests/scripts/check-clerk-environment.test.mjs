import { describe, expect, it, vi } from 'vitest'

import {
  checkClerkEnvironment,
  getClerkPrivacyDrift,
} from '../../scripts/check-clerk-environment.mjs'

function environment({ captchaEnabled = false, captchaProvider = null } = {}) {
  return {
    display_config: { captcha_provider: captchaProvider },
    user_settings: { sign_up: { captcha_enabled: captchaEnabled } },
  }
}

describe('Clerk environment privacy check', () => {
  it('accepts disabled CAPTCHA without a provider', () => {
    expect(getClerkPrivacyDrift(environment())).toEqual([])
  })

  it('reports enabled CAPTCHA and a configured provider', () => {
    expect(
      getClerkPrivacyDrift(
        environment({ captchaEnabled: true, captchaProvider: 'turnstile' }),
      ),
    ).toEqual([
      'user_settings.sign_up.captcha_enabled must be false',
      'display_config.captcha_provider must be null',
    ])
  })

  it('fails closed when expected configuration fields are absent', () => {
    expect(getClerkPrivacyDrift({})).toHaveLength(2)
  })

  it('checks the fetched production response', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(environment()),
    })

    await expect(
      checkClerkEnvironment({ fetchImplementation }),
    ).resolves.toBeUndefined()
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://clerk.tinfoil.sh/v1/environment',
      expect.objectContaining({
        headers: { accept: 'application/json' },
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('retries rate limits and server errors with bounded backoff', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(environment()),
      })
    const sleepImplementation = vi.fn().mockResolvedValue(undefined)

    await expect(
      checkClerkEnvironment({ fetchImplementation, sleepImplementation }),
    ).resolves.toBeUndefined()
    expect(fetchImplementation).toHaveBeenCalledTimes(3)
    expect(sleepImplementation.mock.calls).toEqual([[500], [1_000]])
  })

  it.each([
    ['network failure', new TypeError('connection failed')],
    ['timeout', new DOMException('timed out', 'TimeoutError')],
  ])('retries a structured %s and then succeeds', async (_, requestError) => {
    const fetchImplementation = vi
      .fn()
      .mockRejectedValueOnce(requestError)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(environment()),
      })
    const sleepImplementation = vi.fn().mockResolvedValue(undefined)

    await expect(
      checkClerkEnvironment({ fetchImplementation, sleepImplementation }),
    ).resolves.toBeUndefined()
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
    expect(sleepImplementation).toHaveBeenCalledWith(500)
  })

  it('does not retry an ordinary client error', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
    })
    const sleepImplementation = vi.fn()

    await expect(
      checkClerkEnvironment({ fetchImplementation, sleepImplementation }),
    ).rejects.toThrow('Clerk environment request failed with status 400')
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
    expect(sleepImplementation).not.toHaveBeenCalled()
  })

  it('stops retrying after the bounded attempt count', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    })
    const sleepImplementation = vi.fn().mockResolvedValue(undefined)

    await expect(
      checkClerkEnvironment({ fetchImplementation, sleepImplementation }),
    ).rejects.toThrow('Clerk environment request failed with status 503')
    expect(fetchImplementation).toHaveBeenCalledTimes(3)
    expect(sleepImplementation.mock.calls).toEqual([[500], [1_000]])
  })

  it('does not infer retryability from an error message', async () => {
    const fetchImplementation = vi
      .fn()
      .mockRejectedValue(new Error('network timeout'))
    const sleepImplementation = vi.fn()

    await expect(
      checkClerkEnvironment({ fetchImplementation, sleepImplementation }),
    ).rejects.toThrow('network timeout')
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
    expect(sleepImplementation).not.toHaveBeenCalled()
  })

  it('does not retry privacy configuration drift', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(environment({ captchaEnabled: true })),
    })
    const sleepImplementation = vi.fn()

    await expect(
      checkClerkEnvironment({ fetchImplementation, sleepImplementation }),
    ).rejects.toThrow('Clerk privacy configuration drifted')
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
    expect(sleepImplementation).not.toHaveBeenCalled()
  })
})
