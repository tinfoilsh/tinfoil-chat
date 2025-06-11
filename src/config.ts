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

export { API_BASE_URL, CLERK_PUBLISHABLE_KEY, validateConfig }
