import { PasskeySetupFailedModal } from '@/components/modals/passkey-setup-failed-modal'
import { fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

describe('PasskeySetupFailedModal', () => {
  const baseProps = {
    isOpen: true,
    onRetryPasskey: () => {},
    onEnableManualBackup: () => {},
    onDismiss: () => {},
  }

  it('renders the backup-failure warning text', () => {
    render(createElement(PasskeySetupFailedModal, baseProps))

    expect(
      screen.getByRole('heading', { name: /chats are not being backed up/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/your chats will only exist on this device/i),
    ).toBeInTheDocument()
  })

  it('invokes onRetryPasskey when the primary button is clicked', () => {
    const onRetryPasskey = vi.fn()
    render(
      createElement(PasskeySetupFailedModal, { ...baseProps, onRetryPasskey }),
    )

    fireEvent.click(
      screen.getByRole('button', { name: /try again with passkey/i }),
    )

    expect(onRetryPasskey).toHaveBeenCalledTimes(1)
  })

  it('invokes onEnableManualBackup when the manual-backup button is clicked', () => {
    const onEnableManualBackup = vi.fn()
    render(
      createElement(PasskeySetupFailedModal, {
        ...baseProps,
        onEnableManualBackup,
      }),
    )

    fireEvent.click(
      screen.getByRole('button', { name: /enable manual backup/i }),
    )

    expect(onEnableManualBackup).toHaveBeenCalledTimes(1)
  })

  it('invokes onDismiss when the user chooses to continue without backup', () => {
    const onDismiss = vi.fn()
    render(createElement(PasskeySetupFailedModal, { ...baseProps, onDismiss }))

    fireEvent.click(
      screen.getByRole('button', { name: /continue without backup/i }),
    )

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('disables every action while a passkey retry is in flight', () => {
    const onRetryPasskey = vi.fn()
    const onEnableManualBackup = vi.fn()
    const onDismiss = vi.fn()
    render(
      createElement(PasskeySetupFailedModal, {
        ...baseProps,
        isRetryingPasskey: true,
        onRetryPasskey,
        onEnableManualBackup,
        onDismiss,
      }),
    )

    const retryButton = screen.getByRole('button', { name: /trying/i })
    const manualButton = screen.getByRole('button', {
      name: /enable manual backup/i,
    })
    const dismissButton = screen.getByRole('button', {
      name: /continue without backup/i,
    })

    expect(retryButton).toBeDisabled()
    expect(manualButton).toBeDisabled()
    expect(dismissButton).toBeDisabled()

    fireEvent.click(retryButton)
    fireEvent.click(manualButton)
    fireEvent.click(dismissButton)
    expect(onRetryPasskey).not.toHaveBeenCalled()
    expect(onEnableManualBackup).not.toHaveBeenCalled()
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('does not render its content when closed', () => {
    render(
      createElement(PasskeySetupFailedModal, { ...baseProps, isOpen: false }),
    )

    expect(
      screen.queryByRole('heading', { name: /chats are not being backed up/i }),
    ).not.toBeInTheDocument()
  })

  it('hides the provider-recommendation details by default and reveals them when the dropdown is expanded', () => {
    render(createElement(PasskeySetupFailedModal, baseProps))

    expect(
      screen.queryByText(/tinfoil works best with built-in passkey managers/i),
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /why is this happening/i }),
    )

    expect(
      screen.getByText(/tinfoil works best with built-in passkey managers/i),
    ).toBeInTheDocument()
  })

  it('hides retry and swaps to unlock copy when allowRetry is false', () => {
    render(
      createElement(PasskeySetupFailedModal, {
        ...baseProps,
        allowRetry: false,
      }),
    )

    expect(
      screen.queryByRole('button', { name: /try again with passkey/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /unlock your chats/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/we detected existing encrypted chats on your account/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /enter encryption key/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /continue without backup/i }),
    ).toBeInTheDocument()
  })

  it('shows the unlock-specific dropdown copy when allowRetry is false', () => {
    render(
      createElement(PasskeySetupFailedModal, {
        ...baseProps,
        allowRetry: false,
      }),
    )

    fireEvent.click(
      screen.getByRole('button', { name: /why isn't passkey available/i }),
    )

    expect(
      screen.getByText(
        /we detected existing encrypted chats that weren't backed up with a passkey/i,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/you can start fresh with a new one/i),
    ).toBeInTheDocument()
  })
})
