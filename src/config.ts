// For Next.js, public environment variables are replaced at build time
// We'll provide fallback values for development if not set
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || ''
const CLERK_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''

// Only throw errors when actually used in a client component
function validateConfig() {
  if (!API_BASE_URL) {
    throw new Error(
      'Missing required environment variable: NEXT_PUBLIC_API_BASE_URL',
    )
  }
  if (!CLERK_PUBLISHABLE_KEY) {
    throw new Error(
      'Missing required environment variable: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    )
  }
}

// Pagination settings
export const PAGINATION = {
  CHATS_PER_PAGE: 20,
} as const

// Cloud sync settings
export const CLOUD_SYNC = {
  RETRY_DELAY: 100, // milliseconds
  SYNC_INTERVAL: 15000, // 15 seconds - frequency for syncing chats and profile
  // Grace period to avoid deleting chats that were just uploaded but may not yet
  // appear in eventually-consistent remote listings
  DELETION_GRACE_MS: 120000, // 2 minutes
  // Additional safety: if a chat remains missing from remote listings beyond this TTL
  // (across sync cycles), it can be considered deleted remotely.
  DELETION_TTL_MS: 600000, // 10 minutes
} as const

// UI settings
export const UI = {
  TOAST_DURATION: 2000, // milliseconds
} as const

export { API_BASE_URL, CLERK_PUBLISHABLE_KEY, validateConfig }
