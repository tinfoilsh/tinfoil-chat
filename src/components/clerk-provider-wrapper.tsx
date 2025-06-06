'use client'

import type { ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { CLERK_PUBLISHABLE_KEY } from '@/config'

// Dynamically import ClerkProvider to avoid SSR issues during build
const DynamicClerkProvider = dynamic(
  () => import('@clerk/nextjs').then((mod) => mod.ClerkProvider),
  {
    ssr: false,
    loading: () => null,
  }
)

interface ClerkProviderWrapperProps {
  children: ReactNode
}

export function ClerkProviderWrapper({ children }: ClerkProviderWrapperProps) {
  // If no Clerk key, just render children without provider
  if (!CLERK_PUBLISHABLE_KEY) {
    console.warn('Clerk publishable key not found, running without authentication')
    return <>{children}</>
  }

  return (
    <DynamicClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      telemetry={false}
      afterSignOutUrl="/"
      appearance={{
        elements: {
          formButtonPrimary: 'bg-emerald-500 hover:bg-emerald-600',
          card: 'bg-gray-800',
        }
      }}
    >
      {children}
    </DynamicClerkProvider>
  )
}