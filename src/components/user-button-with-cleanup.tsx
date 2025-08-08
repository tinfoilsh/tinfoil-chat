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
  // Just render the standard UserButton
  // The cleanup will be handled by checking auth state elsewhere
  return <UserButton appearance={appearance} />
}
