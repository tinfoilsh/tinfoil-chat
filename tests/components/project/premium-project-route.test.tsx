import { PremiumProjectRoute } from '@/components/project/premium-project-route'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isLoading: false,
  subscriptionActive: false,
  replace: vi.fn(),
}))

vi.mock('next/router', () => ({
  useRouter: () => ({ replace: mocks.replace }),
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
})
