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

const getSignOutRedirectUrl = () => {
  // Use an absolute URL when running in the browser; fall back to a relative path during SSR
  if (typeof window !== 'undefined') {
    const origin = window.location.origin
    return `${origin}/signout-complete`
  }
  return '/signout-complete'
}

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

        // Sign out with redirect to our custom page using absolute URL
        await signOut({ redirectUrl: getSignOutRedirectUrl() })
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
