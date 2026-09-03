import type { BaseModel } from '@/config/models'

// Dev simulator model configuration
export const DEV_SIMULATOR_MODEL: BaseModel = {
  modelName: 'dev-simulator',
  image: '🧪',
  name: 'Dev Simulator',
  nameShort: 'Dev',
  description: 'Development model for testing streaming and thinking behaviors',
  descriptionShort: 'Best for testing streaming behaviors',
  details:
    'Simulates various streaming patterns including thinking, content generation, and edge cases',
  parameters: 'Configurable via query patterns',
  contextWindowTokens: 32000,
  recommendedUse: 'Testing and development only',
  type: 'chat',
  chat: true,
  multimodal: false,
  endpoint: '/api/dev/simulator',
}

const RETRY_TEST_FAIL_COUNT = 3

// Track failure counts per session for retry testing
// -1 means ready to start a new failure sequence, 0 means all failures done (success state)
const retryTestState = {
  failuresRemaining: -1,
}

// Check if retry test should fail (and update state)
export function shouldRetryTestFail(query: string): boolean {
  const lowerQuery = query.toLowerCase()

  // Only applies to "test retry" pattern
  if (!lowerQuery.includes('test retry')) {
    return false
  }

  // Reset counter when starting a new test sequence (-1 is the sentinel for "ready to reset")
  if (retryTestState.failuresRemaining === -1) {
    retryTestState.failuresRemaining = RETRY_TEST_FAIL_COUNT
  }

  // Check if we should fail
  if (retryTestState.failuresRemaining > 0) {
    retryTestState.failuresRemaining--
    return true
  }

  // All failures exhausted - succeed and reset for next test sequence
  retryTestState.failuresRemaining = -1
  return false
}
