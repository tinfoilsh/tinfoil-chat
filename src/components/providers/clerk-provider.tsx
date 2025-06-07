'use client'

import { ClerkProvider as BaseClerkProvider } from '@clerk/nextjs'
import type { ReactNode } from 'react'

interface ClerkProviderProps {
  children: ReactNode
}

export function ClerkProvider({ children }: ClerkProviderProps) {
  // Get the publishable key at runtime
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

  // If no key is available, just render children without Clerk
  if (!publishableKey) {
    console.warn('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set')
    return <>{children}</>
  }

  return (
    <BaseClerkProvider
      publishableKey={publishableKey}
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
    </BaseClerkProvider>
  )
}