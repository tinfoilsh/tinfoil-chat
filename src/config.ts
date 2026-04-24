// For Next.js, public environment variables are replaced at build time
// We'll provide fallback values for development if not set
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || ''

// Local dev mode: bypass TinfoilAI client and connect to local router
export const IS_DEV = process.env.NEXT_PUBLIC_DEV === 'true'
export const DEV_API_KEY = process.env.NEXT_PUBLIC_DEV_API_KEY || ''

// Pagination settings
export const PAGINATION = {
  CHATS_PER_PAGE: 20,
} as const

// Cloud sync settings
export const CLOUD_SYNC = {
  RETRY_DELAY: 100, // milliseconds
  CHAT_SYNC_INTERVAL: 60000, // 60 seconds (1 minute) - frequency for syncing chats
  PROFILE_SYNC_INTERVAL: 300000, // 5 minutes - frequency for syncing profile (less frequent)
  KEY_VALIDATION_PROBE_LIMIT: 3,
} as const

export const PASSKEY = {
  CREDENTIAL_SAVE_MAX_ATTEMPTS: 3,
} as const
