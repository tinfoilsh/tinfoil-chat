const API_BASE_URL: string =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.tinfoil.sh'

const CLERK_PUBLISHABLE_KEY: string = (() => {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  if (!key) {
    throw new Error('Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY environment variable')
  }
  return key
})()

export { API_BASE_URL, CLERK_PUBLISHABLE_KEY }
