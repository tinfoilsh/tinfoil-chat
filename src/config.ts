function getRequiredEnvVar(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

const API_BASE_URL: string = getRequiredEnvVar('NEXT_PUBLIC_API_BASE_URL')

const CLERK_PUBLISHABLE_KEY: string = getRequiredEnvVar('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY')

export { API_BASE_URL, CLERK_PUBLISHABLE_KEY }
