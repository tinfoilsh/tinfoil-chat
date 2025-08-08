'use client'

import { UserButton } from '@clerk/nextjs'

interface UserButtonWithCleanupProps {
  appearance?: {
    elements?: {
      avatarBox?: string
    }
  }
}

export function UserButtonWithCleanup({
  appearance,
}: UserButtonWithCleanupProps) {
  // Just render the standard UserButton exactly like landing-site
  return <UserButton appearance={appearance} />
}
