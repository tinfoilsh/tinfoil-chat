import SignInPage from '@/pages/signin'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => {
  const signIn = {
    id: undefined as string | undefined,
    status: 'needs_identifier',
    supportedSecondFactors: [] as Array<{ strategy: string }>,
    create: vi.fn(),
    emailCode: {
      sendCode: vi.fn(),
      verifyCode: vi.fn(),
    },
    mfa: {
      sendEmailCode: vi.fn(),
      verifyEmailCode: vi.fn(),
      verifyTOTP: vi.fn(),
    },
    sso: vi.fn(),
    finalize: vi.fn(),
    reset: vi.fn(),
  }
  const signUp = {
    status: 'missing_requirements',
    missingFields: [] as string[],
    create: vi.fn(),
    update: vi.fn(),
    finalize: vi.fn(),
  }

  const router = {
    isReady: true,
    query: {} as Record<string, string | undefined>,
  }

  return { clerkLoaded: true, signIn, signUp, router, routerPush: vi.fn() }
})

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({ loaded: auth.clerkLoaded }),
  useSignIn: () => ({
    signIn: auth.signIn,
    errors: { fields: {} },
    fetchStatus: 'idle',
  }),
  useSignUp: () => ({
    signUp: auth.signUp,
    errors: { fields: {} },
    fetchStatus: 'idle',
  }),
}))

vi.mock('next/router', () => ({
  useRouter: () => ({ push: auth.routerPush, ...auth.router }),
}))

describe('SignInPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.clerkLoaded = true
    auth.router.isReady = true
    auth.router.query = {}
    auth.signIn.id = undefined
    auth.signIn.status = 'needs_identifier'
    auth.signIn.supportedSecondFactors = []
    auth.signUp.status = 'missing_requirements'
    auth.signUp.missingFields = []
    auth.signIn.create.mockResolvedValue({ error: null })
    auth.signIn.emailCode.sendCode.mockResolvedValue({ error: null })
    auth.signIn.emailCode.verifyCode.mockResolvedValue({ error: null })
    auth.signIn.mfa.sendEmailCode.mockResolvedValue({ error: null })
    auth.signIn.mfa.verifyEmailCode.mockResolvedValue({ error: null })
    auth.signIn.mfa.verifyTOTP.mockResolvedValue({ error: null })
    auth.signIn.sso.mockResolvedValue({ error: null })
    auth.signIn.reset.mockResolvedValue({ error: null })
    auth.signUp.create.mockResolvedValue({ error: null })
    auth.signUp.update.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the branded layout with social and email options', () => {
    const { container } = render(<SignInPage />)

    expect(container.firstChild).toHaveClass('font-aeonik')
    expect(
      screen.queryByRole('heading', { name: 'Welcome to Tinfoil' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Private AI Chat')).not.toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Tinfoil' })).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Back to chat' })).toHaveAttribute(
      'href',
      '/',
    )
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Continue with Apple' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeInTheDocument()
    expect(document.querySelector('#clerk-captcha')).toBeInTheDocument()
    expect(screen.getByText(/By continuing, you agree to our/)).toHaveClass(
      'text-balance',
      'text-center',
    )
  })

  it('clears an abandoned sign-in attempt on a fresh landing', async () => {
    auth.signIn.id = 'stale_sign_in'

    render(<SignInPage />)

    await waitFor(() => {
      expect(auth.signIn.reset).toHaveBeenCalledTimes(1)
    })
  })

  it('preserves a sign-in attempt resumed from the OAuth callback', () => {
    auth.router.query = { resume: '1' }
    auth.signIn.id = 'resumed_sign_in'

    render(<SignInPage />)

    expect(auth.signIn.reset).not.toHaveBeenCalled()
  })

  it('does not reset a sign-in attempt started after landing', () => {
    const { rerender } = render(<SignInPage />)

    auth.signIn.id = 'new_sign_in'
    rerender(<SignInPage />)

    expect(auth.signIn.reset).not.toHaveBeenCalled()
  })

  it('sends a privacy-preserving email code for sign-in or sign-up', async () => {
    render(<SignInPage />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
      target: { value: 'person@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(auth.signIn.create).toHaveBeenCalledWith({
        identifier: 'person@example.com',
        signUpIfMissing: true,
      })
      expect(auth.signIn.emailCode.sendCode).toHaveBeenCalledTimes(1)
    })

    expect(
      screen.getByRole('heading', { name: 'Check your email' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/person@example\.com/)).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'Verification code' }),
    ).toHaveAttribute('autocomplete', 'one-time-code')
  })

  it('finalizes an existing account after code verification', async () => {
    auth.signIn.emailCode.verifyCode.mockImplementation(async () => {
      auth.signIn.status = 'complete'
      return { error: null }
    })
    render(<SignInPage />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
      target: { value: 'person@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    const codeInput = await screen.findByRole('textbox', {
      name: 'Verification code',
    })
    fireEvent.change(codeInput, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

    await waitFor(() => {
      expect(auth.signIn.emailCode.verifyCode).toHaveBeenCalledWith({
        code: '123456',
      })
      expect(auth.signIn.finalize).toHaveBeenCalledWith({
        navigate: expect.any(Function),
      })
    })
  })

  it('transfers a verified email to sign-up when the account is new', async () => {
    auth.signIn.emailCode.verifyCode.mockResolvedValue({
      error: { code: 'sign_up_if_missing_transfer' },
    })
    auth.signUp.create.mockImplementation(async () => {
      auth.signUp.status = 'complete'
      return { error: null }
    })
    render(<SignInPage />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
      target: { value: 'new@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Verification code' }),
      {
        target: { value: '654321' },
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

    await waitFor(() => {
      expect(auth.signUp.create).toHaveBeenCalledWith({ transfer: true })
      expect(auth.signUp.finalize).toHaveBeenCalledWith({
        navigate: expect.any(Function),
      })
    })
  })

  it('verifies an authenticator app code when TOTP is the second factor', async () => {
    auth.signIn.emailCode.verifyCode.mockImplementation(async () => {
      auth.signIn.status = 'needs_second_factor'
      auth.signIn.supportedSecondFactors = [{ strategy: 'totp' }]
      return { error: null }
    })
    auth.signIn.mfa.verifyTOTP.mockImplementation(async () => {
      auth.signIn.status = 'complete'
      return { error: null }
    })
    render(<SignInPage />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
      target: { value: 'person@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Verification code' }),
      { target: { value: '123456' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

    expect(
      await screen.findByRole('heading', { name: 'Two-step verification' }),
    ).toBeInTheDocument()
    expect(auth.signIn.mfa.sendEmailCode).not.toHaveBeenCalled()

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Verification code' }),
      { target: { value: '987654' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

    await waitFor(() => {
      expect(auth.signIn.mfa.verifyTOTP).toHaveBeenCalledWith({
        code: '987654',
      })
      expect(auth.signIn.finalize).toHaveBeenCalledWith({
        navigate: expect.any(Function),
      })
    })
  })

  it('lets the user fall back to an email MFA code from the TOTP prompt', async () => {
    auth.signIn.emailCode.verifyCode.mockImplementation(async () => {
      auth.signIn.status = 'needs_second_factor'
      auth.signIn.supportedSecondFactors = [
        { strategy: 'totp' },
        { strategy: 'email_code' },
      ]
      return { error: null }
    })
    render(<SignInPage />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
      target: { value: 'person@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Verification code' }),
      { target: { value: '123456' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

    fireEvent.click(
      await screen.findByRole('button', { name: 'Email me a code instead' }),
    )

    await waitFor(() => {
      expect(auth.signIn.mfa.sendEmailCode).toHaveBeenCalledTimes(1)
    })
    expect(
      await screen.findByRole('heading', { name: 'Check your email' }),
    ).toBeInTheDocument()

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Verification code' }),
      { target: { value: '555555' } },
    )
    auth.signIn.mfa.verifyEmailCode.mockImplementation(async () => {
      auth.signIn.status = 'complete'
      return { error: null }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

    await waitFor(() => {
      expect(auth.signIn.mfa.verifyEmailCode).toHaveBeenCalledWith({
        code: '555555',
      })
      expect(auth.signIn.finalize).toHaveBeenCalled()
    })
  })

  it.each([
    ['Google', 'oauth_google'],
    ['Apple', 'oauth_apple'],
  ] as const)(
    'starts %s sign-in in the current tab',
    async (provider, strategy) => {
      const openSpy = vi.spyOn(window, 'open')
      render(<SignInPage />)

      fireEvent.click(
        screen.getByRole('button', { name: `Continue with ${provider}` }),
      )

      await waitFor(() => {
        expect(openSpy).not.toHaveBeenCalled()
        expect(auth.signIn.sso).toHaveBeenCalledWith({
          strategy,
          redirectCallbackUrl: '/sso-callback',
          redirectUrl: '/',
        })
      })
    },
  )

  it('shows the Clerk error when social sign-in cannot start', async () => {
    auth.signIn.sso.mockResolvedValue({
      error: { longMessage: 'Google sign-in is unavailable.' },
    })
    render(<SignInPage />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with Google' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Google sign-in is unavailable.',
    )
  })

  it('prefers the detailed Clerk error over its generic message', async () => {
    auth.signIn.sso.mockResolvedValue({
      error: {
        message: 'Clerk: Request failed (oauth_error)',
        errors: [{ longMessage: 'Google sign-in is temporarily unavailable.' }],
      },
    })
    render(<SignInPage />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with Google' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Google sign-in is temporarily unavailable.',
    )
  })
})
