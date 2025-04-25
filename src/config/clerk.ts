/**
 * Clerk configuration to prevent the double Google account prompt issue
 * and ensure a consistent authentication experience.
 */
export const clerkConfig = {
  // Configure the Google OAuth provider to use select_account prompt
  // This ensures the account selection UI is shown only once
  oauthOptions: {
    google: {
      prompt: 'select_account',
    },
  },

  // Route configurations
  routing: {
    signInUrl: '/login',
    signUpUrl: '/login',
  },
}
