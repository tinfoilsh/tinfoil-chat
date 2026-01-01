// For Next.js, public environment variables are replaced at build time
// We'll provide fallback values for development if not set
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || ''

// Pagination settings
export const PAGINATION = {
  CHATS_PER_PAGE: 20,
} as const

// Cloud sync settings
export const CLOUD_SYNC = {
  RETRY_DELAY: 100, // milliseconds
  CHAT_SYNC_INTERVAL: 60000, // 60 seconds (1 minute) - frequency for syncing chats
  PROFILE_SYNC_INTERVAL: 300000, // 5 minutes - frequency for syncing profile (less frequent)
  // Grace period to avoid deleting chats that were just uploaded but may not yet
  // appear in eventually-consistent remote listings
  DELETION_GRACE_MS: 120000, // 2 minutes
  // Additional safety: if a chat remains missing from remote listings beyond this TTL
  // (across sync cycles), it can be considered deleted remotely.
  DELETION_TTL_MS: 600000, // 10 minutes
} as const
