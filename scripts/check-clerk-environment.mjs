import { pathToFileURL } from 'node:url'

export const CLERK_ENVIRONMENT_URL = 'https://clerk.tinfoil.sh/v1/environment'

const REQUEST_TIMEOUT_MS = 10_000
const MAX_REQUEST_ATTEMPTS = 3
const INITIAL_RETRY_DELAY_MS = 500
const MAX_RETRY_DELAY_MS = 2_000
const RETRY_BACKOFF_FACTOR = 2
const RATE_LIMIT_STATUS = 429
const SERVER_ERROR_MIN_STATUS = 500
const SERVER_ERROR_MAX_STATUS = 599

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function isRetryableRequestError(error) {
  return (
    error instanceof TypeError ||
    (error instanceof DOMException &&
      (error.name === 'AbortError' || error.name === 'TimeoutError'))
  )
}

function isRetryableStatus(status) {
  return (
    status === RATE_LIMIT_STATUS ||
    (status >= SERVER_ERROR_MIN_STATUS && status <= SERVER_ERROR_MAX_STATUS)
  )
}

function retryDelay(attempt) {
  return Math.min(
    INITIAL_RETRY_DELAY_MS * RETRY_BACKOFF_FACTOR ** (attempt - 1),
    MAX_RETRY_DELAY_MS,
  )
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
  sleepImplementation = sleep,
  url = CLERK_ENVIRONMENT_URL,
} = {}) {
  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    let response

    try {
      response = await fetchImplementation(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      if (!isRetryableRequestError(error) || attempt === MAX_REQUEST_ATTEMPTS) {
        throw error
      }

      await sleepImplementation(retryDelay(attempt))
      continue
    }

    if (!response.ok) {
      if (
        isRetryableStatus(response.status) &&
        attempt < MAX_REQUEST_ATTEMPTS
      ) {
        await sleepImplementation(retryDelay(attempt))
        continue
      }

      throw new Error(
        `Clerk environment request failed with status ${response.status}`,
      )
    }

    const environment = await response.json()
    const drift = getClerkPrivacyDrift(environment)

    if (drift.length > 0) {
      throw new Error(
        `Clerk privacy configuration drifted:\n- ${drift.join('\n- ')}`,
      )
    }

    return
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
