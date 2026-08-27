import { PremiumProjectRoute } from '@/components/project/premium-project-route'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isLoading: false,
  subscriptionActive: false,
  routerReady: true,
  replace: vi.fn(),
}))

vi.mock('next/router', () => ({
  useRouter: () => ({ isReady: mocks.routerReady, replace: mocks.replace }),
}))

vi.mock('@/hooks/use-subscription-status', () => ({
  useSubscriptionStatus: () => ({
    isLoading: mocks.isLoading,
    chat_subscription_active: mocks.subscriptionActive,
  }),
}))

vi.mock('@/components/project/project-provider', () => ({
  ProjectProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('@/components/chat', () => ({
  ChatInterface: () => <div>Project chat</div>,
}))

describe('PremiumProjectRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isLoading = false
    mocks.subscriptionActive = false
    mocks.routerReady = true
  })

  it('redirects free users to chat with the upgrade prompt marker', () => {
    render(<PremiumProjectRoute projectId="project-1" />)

    expect(mocks.replace).toHaveBeenCalledWith('/chat?upgrade=projects')
    expect(screen.queryByText('Project chat')).not.toBeInTheDocument()
  })

  it('renders project chat for Premium users', () => {
    mocks.subscriptionActive = true
    render(<PremiumProjectRoute projectId="project-1" />)

    expect(screen.getByText('Project chat')).toBeInTheDocument()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('does not render or redirect while subscription status is loading', () => {
    mocks.isLoading = true
    render(<PremiumProjectRoute projectId="project-1" />)

    expect(screen.queryByText('Project chat')).not.toBeInTheDocument()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('does not render project chat before route parameters are ready', () => {
    mocks.subscriptionActive = true
    mocks.routerReady = false
    render(<PremiumProjectRoute projectId={null} />)

    expect(screen.queryByText('Project chat')).not.toBeInTheDocument()
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
