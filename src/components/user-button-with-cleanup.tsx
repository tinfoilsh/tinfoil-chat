'use client'

import { useClerk, UserButton } from '@clerk/nextjs'
import { useCallback, useEffect } from 'react'

interface UserButtonWithCleanupProps {
  appearance?: {
    elements?: {
      avatarBox?: string
    }
  }
}

const SIGNOUT_REDIRECT_PATH = '/signout-complete'

export function UserButtonWithCleanup({
  appearance,
}: UserButtonWithCleanupProps) {
  const { signOut } = useClerk()

  const handleSignoutClick = useCallback(
    async (event: MouseEvent) => {
      const target = event.target as HTMLElement

      // Check if this is a sign out button click
      const isSignOutButton =
        target.closest('[aria-label="Sign out"]') ||
        target
          .closest('button')
          ?.textContent?.toLowerCase()
          .includes('sign out')

      if (isSignOutButton) {
        // Prevent default behavior and handle signout ourselves
        event.preventDefault()
        event.stopPropagation()

        // Sign out with redirect to our custom page
        await signOut({ redirectUrl: SIGNOUT_REDIRECT_PATH })
      }
    },
    [signOut],
  )

  useEffect(() => {
    // Listen for signout clicks in capture phase to intercept them
    document.addEventListener('click', handleSignoutClick, true)

    return () => {
      document.removeEventListener('click', handleSignoutClick, true)
    }
  }, [handleSignoutClick])

  return <UserButton appearance={appearance} />
}
