import {
  isPrfSupported,
  resetPrfSupportCache,
} from '@/services/passkey/prf-support'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('prf-support', () => {
  const originalPublicKeyCredential = globalThis.PublicKeyCredential

  beforeEach(() => {
    resetPrfSupportCache()
  })

  afterEach(() => {
    // Restore original — always run even if the original was undefined,
    // otherwise a test that defines PublicKeyCredential will leak it.
    Object.defineProperty(globalThis, 'PublicKeyCredential', {
      value: originalPublicKeyCredential,
      writable: true,
      configurable: true,
    })
    vi.restoreAllMocks()
  })

  it('should return false when PublicKeyCredential is not available', async () => {
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    const result = await isPrfSupported()
    expect(result).toBe(false)
  })

  it('should return false when platform authenticator is not available', async () => {
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi
          .fn()
          .mockResolvedValue(false),
      },
      writable: true,
      configurable: true,
    })

    const result = await isPrfSupported()
    expect(result).toBe(false)
  })

  it('should return true when platform authenticator is available (optimistic)', async () => {
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi
          .fn()
          .mockResolvedValue(true),
      },
      writable: true,
      configurable: true,
    })

    const result = await isPrfSupported()
    expect(result).toBe(true)
  })

  it('should return true when getClientCapabilities reports PRF support', async () => {
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi
          .fn()
          .mockResolvedValue(true),
        getClientCapabilities: vi
          .fn()
          .mockResolvedValue({ 'extension-prf': true }),
      },
      writable: true,
      configurable: true,
    })

    const result = await isPrfSupported()
    expect(result).toBe(true)
  })

  it('should cache the result after first call', async () => {
    const mockAvailable = vi.fn().mockResolvedValue(true)
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: mockAvailable,
      },
      writable: true,
      configurable: true,
    })

    const result1 = await isPrfSupported()
    const result2 = await isPrfSupported()

    expect(result1).toBe(true)
    expect(result2).toBe(true)
    expect(mockAvailable).toHaveBeenCalledTimes(1)
  })

  it('should reset cache when resetPrfSupportCache is called', async () => {
    const mockAvailable = vi.fn().mockResolvedValue(true)
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: mockAvailable,
      },
      writable: true,
      configurable: true,
    })

    await isPrfSupported()
    expect(mockAvailable).toHaveBeenCalledTimes(1)

    resetPrfSupportCache()
    await isPrfSupported()
    expect(mockAvailable).toHaveBeenCalledTimes(2)
  })
})
