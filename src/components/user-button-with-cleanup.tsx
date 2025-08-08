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
  return <UserButton appearance={appearance} />
}
