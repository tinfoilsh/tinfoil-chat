import { VerifierSidebar } from '@/components/verification-sidebar'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getVerificationDocument: vi.fn(),
}))

vi.mock('@/services/inference/tinfoil-client', () => ({
  getVerificationDocument: mocks.getVerificationDocument,
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

function renderSidebar(onVerificationComplete: (success: boolean) => void) {
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
    mocks.getVerificationDocument.mockReset()
    onLineSpy = vi.spyOn(window.navigator, 'onLine', 'get')
  })

  afterEach(() => {
    onLineSpy.mockRestore()
  })

  it('keeps a previously successful verification when fetching offline', async () => {
    // Offline: retry attempts short-circuit, but the cached attestation from
    // startup verification is still available without network work.
    onLineSpy.mockReturnValue(false)
    mocks.getVerificationDocument.mockResolvedValue({ securityVerified: true })
    const onVerificationComplete = vi.fn()

    renderSidebar(onVerificationComplete)
    requestVerificationDocument()

    await waitFor(() => expect(onVerificationComplete).toHaveBeenCalled())
    expect(onVerificationComplete).toHaveBeenCalledWith(true)
    expect(onVerificationComplete).not.toHaveBeenCalledWith(false)
  })

  it('reports failure on exhaustion when no verification is cached', async () => {
    onLineSpy.mockReturnValue(true)
    mocks.getVerificationDocument.mockRejectedValue(
      new Error('attestation unavailable'),
    )
    const onVerificationComplete = vi.fn()

    renderSidebar(onVerificationComplete)
    requestVerificationDocument()

    await waitFor(() =>
      expect(onVerificationComplete).toHaveBeenCalledWith(false),
    )
  })
})
