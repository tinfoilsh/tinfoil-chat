import { CONSTANTS, MAX_PROMPT_MESSAGES } from './constants'

/**
 * Gets recent message timestamps from the last 24 hours
 */
function getRecentMessages(): number[] {
  try {
    const stored = localStorage.getItem(CONSTANTS.RATE_LIMIT_STORAGE_KEY)
    if (!stored) return []

    const timestamps = JSON.parse(stored) as number[]
    const dayAgo =
      Date.now() - CONSTANTS.RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000
    return timestamps.filter((time) => time > dayAgo)
  } catch {
    return []
  }
}

/**
 * Records a new message and returns remaining message count
 */
export function recordMessage(): number {
  const recent = getRecentMessages()
  recent.push(Date.now())
  localStorage.setItem(CONSTANTS.RATE_LIMIT_STORAGE_KEY, JSON.stringify(recent))
  return MAX_PROMPT_MESSAGES - recent.length
}

/**
 * Checks if user has hit their rate limit
 */
export function isRateLimitExceeded(): boolean {
  return getRecentMessages().length >= MAX_PROMPT_MESSAGES
}

/**
 * Gets the number of messages remaining before hitting rate limit
 */
export function getRemainingMessages(): number {
  try {
    const timestamps = getRecentMessages()
    return Math.max(0, MAX_PROMPT_MESSAGES - timestamps.length)
  } catch (error) {
    console.error('Error getting remaining messages:', error)
    return MAX_PROMPT_MESSAGES
  }
}
