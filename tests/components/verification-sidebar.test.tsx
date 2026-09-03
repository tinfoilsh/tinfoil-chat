import {
  VerifierSidebar,
  type VerificationStatus,
} from '@/components/verification-sidebar'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCachedHarnessVerificationDocument: vi.fn(),
  getHarnessVerificationDocument: vi.fn(),
  isDev: false,
}))

// Getter so individual tests can flip IS_DEV after the module graph is loaded.
vi.mock('@/config', () => ({
  get IS_DEV() {
    return mocks.isDev
  },
}))

vi.mock('@/services/inference/agui/client', () => ({
  getCachedHarnessVerificationDocument:
    mocks.getCachedHarnessVerificationDocument,
  getHarnessVerificationDocument: mocks.getHarnessVerificationDocument,
}))

vi.mock('@/utils/error-handling', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}))

vi.mock('@/components/chat/constants', async (importOriginal) => {
  const original = await importOriginal<{
    CONSTANTS: Record<string, unknown>
  }>()
  return {
    CONSTANTS: {
      ...original.CONSTANTS,
      VERIFICATION_MAX_RETRIES: 0,
      VERIFICATION_RETRY_DELAY_MS: 0,
    },
  }
})

const VERIFICATION_CENTER_ORIGIN = 'https://verification-center.tinfoil.sh'

function renderSidebar(
  onVerificationComplete: (status: VerificationStatus) => void,
) {
  return render(
    <VerifierSidebar
      isOpen={false}
      setIsOpen={vi.fn()}
      onVerificationComplete={onVerificationComplete}
      isDarkMode={false}
      isClient={true}
    />,
  )
}

function requestVerificationDocument() {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: VERIFICATION_CENTER_ORIGIN,
        data: { type: 'TINFOIL_REQUEST_VERIFICATION_DOCUMENT' },
      }),
    )
  })
}

describe('VerifierSidebar', () => {
  let onLineSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mocks.getCachedHarnessVerificationDocument.mockReset()
    mocks.getCachedHarnessVerificationDocument.mockReturnValue(null)
    mocks.getHarnessVerificationDocument.mockReset()
    mocks.isDev = false
    onLineSpy = vi.spyOn(window.navigator, 'onLine', 'get')
  })

  afterEach(() => {
    onLineSpy.mockRestore()
  })

  it('keeps a previously successful verification when fetching offline', async () => {
    // Offline: retry attempts short-circuit, but the cached attestation from
    // startup verification is still available without network work.
    onLineSpy.mockReturnValue(false)
    mocks.getCachedHarnessVerificationDocument.mockReturnValue({
      securityVerified: true,
    })
    const onVerificationComplete = vi.fn()

    renderSidebar(onVerificationComplete)
    requestVerificationDocument()

    expect(onVerificationComplete).toHaveBeenCalled()
    expect(onVerificationComplete).toHaveBeenCalledWith('verified')
    expect(onVerificationComplete).not.toHaveBeenCalledWith('failed')
    expect(mocks.getHarnessVerificationDocument).not.toHaveBeenCalled()
  })

  it('reports offline exhaustion without starting initialization', async () => {
    onLineSpy.mockReturnValue(false)
    const onVerificationComplete = vi.fn()

    renderSidebar(onVerificationComplete)
    requestVerificationDocument()

    await waitFor(() =>
      expect(onVerificationComplete).toHaveBeenCalledWith('failed'),
    )
    expect(mocks.getHarnessVerificationDocument).not.toHaveBeenCalled()
    expect(mocks.getCachedHarnessVerificationDocument).toHaveBeenCalledTimes(2)
  })

  it('reports failed when attestation never reaches a verdict', async () => {
    onLineSpy.mockReturnValue(true)
    mocks.getHarnessVerificationDocument.mockResolvedValue({
      securityVerified: undefined,
    })
    const onVerificationComplete = vi.fn()

    renderSidebar(onVerificationComplete)
    requestVerificationDocument()

    await waitFor(() =>
      expect(onVerificationComplete).toHaveBeenCalledWith('failed'),
    )
    expect(onVerificationComplete).not.toHaveBeenCalledWith('pending')
  })

  it('short-circuits to unverified in dev without fetching', async () => {
    mocks.isDev = true
    const onVerificationComplete = vi.fn()

    renderSidebar(onVerificationComplete)
    requestVerificationDocument()

    expect(onVerificationComplete).toHaveBeenCalledWith('unverified')
    expect(mocks.getHarnessVerificationDocument).not.toHaveBeenCalled()
    expect(mocks.getCachedHarnessVerificationDocument).not.toHaveBeenCalled()
  })

  it('keeps the retry lock through the cache fallback', async () => {
    onLineSpy.mockReturnValue(true)
    mocks.getHarnessVerificationDocument.mockResolvedValue(null)
    mocks.getCachedHarnessVerificationDocument.mockImplementation(() => {
      requestVerificationDocument()
      return null
    })
    const onVerificationComplete = vi.fn()

    renderSidebar(onVerificationComplete)
    requestVerificationDocument()

    await waitFor(() =>
      expect(onVerificationComplete).toHaveBeenCalledWith('failed'),
    )
    expect(mocks.getHarnessVerificationDocument).toHaveBeenCalledOnce()
    expect(onVerificationComplete).toHaveBeenCalledOnce()
  })
})
