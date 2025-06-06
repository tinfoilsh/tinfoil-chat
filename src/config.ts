const API_BASE_URL: string =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.tinfoil.sh'

// Allow build to proceed even if environment variable is missing
// Validation will happen at runtime when ClerkProvider is actually used
const CLERK_PUBLISHABLE_KEY: string = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ''

export { API_BASE_URL, CLERK_PUBLISHABLE_KEY }
