const API_BASE_URL: string =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.tinfoil.sh'

// Allow build to proceed even if environment variable is missing
// Validation will happen at runtime when ClerkProvider is actually used
const CLERK_PUBLISHABLE_KEY: string = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ''

// Debug: Test environment variable loading
const DEBUG_TEST: string = process.env.NEXT_PUBLIC_DEBUG_TEST ?? 'not-found'
console.log('Environment Variables Debug:')
console.log(`- NEXT_PUBLIC_DEBUG_TEST: ${DEBUG_TEST}`)
console.log(`- NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${CLERK_PUBLISHABLE_KEY ? 'present' : 'missing'}`)
console.log(`- NEXT_PUBLIC_API_BASE_URL: ${API_BASE_URL}`)

export { API_BASE_URL, CLERK_PUBLISHABLE_KEY }
