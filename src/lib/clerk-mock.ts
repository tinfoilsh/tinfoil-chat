// Mock implementations for Clerk hooks when Clerk is not available

export const mockAuth = () => ({
  userId: null,
  sessionId: null,
  getToken: async () => null,
  isLoaded: true,
  isSignedIn: false,
  signOut: async () => {},
  orgId: null,
  orgRole: null,
  orgSlug: null,
})

export const mockUser = () => ({
  isLoaded: true,
  isSignedIn: false,
  user: null,
})

export const MockSignInButton = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>
}

export const mockClerkClient = () => ({
  users: {
    getUser: async () => {
      throw new Error('Clerk not configured')
    },
  },
})