import { pathToFileURL } from 'node:url'

export const CLERK_ENVIRONMENT_URL = 'https://clerk.tinfoil.sh/v1/environment'

const REQUEST_TIMEOUT_MS = 10_000

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

export function getClerkPrivacyDrift(environment) {
  const drift = []

  if (environment?.user_settings?.sign_up?.captcha_enabled !== false) {
    drift.push('user_settings.sign_up.captcha_enabled must be false')
  }

  if (environment?.display_config?.captcha_provider !== null) {
    drift.push('display_config.captcha_provider must be null')
  }

  return drift
}

export async function checkClerkEnvironment({
  fetchImplementation = fetch,
  url = CLERK_ENVIRONMENT_URL,
} = {}) {
  let response

  try {
    response = await fetchImplementation(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    throw new Error(
      `Clerk environment request failed: ${errorMessage(error)}`,
      { cause: error },
    )
  }

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    throw new Error(
      `Clerk environment request failed with status ${response.status}${statusText}`,
    )
  }

  let environment

  try {
    environment = await response.json()
  } catch (error) {
    throw new Error(
      `Clerk environment response was not valid JSON: ${errorMessage(error)}`,
      { cause: error },
    )
  }

  const drift = getClerkPrivacyDrift(environment)

  if (drift.length > 0) {
    throw new Error(
      `Clerk privacy configuration drifted:\n- ${drift.join('\n- ')}`,
    )
  }
}

async function main() {
  try {
    await checkClerkEnvironment()
    process.stdout.write('Clerk privacy configuration is valid.\n')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main()
}
