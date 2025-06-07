'use client'

import { mockAuth, mockUser, MockSignInButton } from '@/lib/clerk-mock'

// Check if Clerk is available
const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

// Dynamic imports for Clerk hooks
let useAuthOriginal: any = null
let useUserOriginal: any = null
let SignInButtonOriginal: any = null

if (hasClerk) {
  try {
    const clerkModule = require('@clerk/nextjs')
    useAuthOriginal = clerkModule.useAuth
    useUserOriginal = clerkModule.useUser
    SignInButtonOriginal = clerkModule.SignInButton
  } catch (error) {
    console.warn('Failed to load Clerk modules:', error)
  }
}

// Export wrapped hooks that fall back to mocks
export const useAuth = () => {
  if (hasClerk && useAuthOriginal) {
    return useAuthOriginal()
  }
  return mockAuth()
}

export const useUser = () => {
  if (hasClerk && useUserOriginal) {
    return useUserOriginal()
  }
  return mockUser()
}

export const SignInButton = hasClerk && SignInButtonOriginal ? SignInButtonOriginal : MockSignInButton