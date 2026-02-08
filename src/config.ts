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
} as const
