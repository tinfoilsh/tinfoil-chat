import type { AIModel } from './types'

const VERIFIER_VERSION = 'v0.0.9'

export const CONSTANTS = {
  LOADING_TIMEOUT: 500,
  MOBILE_BREAKPOINT: 768,
  DEFAULT_MODEL: 'llama3-3-70b' as AIModel,
  DEFAULT_FREE_MODEL: 'llama3-3-70b' as AIModel,
  VERIFIER_VERSION,
  VERIFIER_WASM_URL: `https://tinfoilsh.github.io/verifier-js/tinfoil-verifier-${VERIFIER_VERSION}.wasm`,
  // Inference proxy URL for all model requests
  INFERENCE_PROXY_URL: 'https://inference.tinfoil.sh',
  // Inference proxy repository for verification
  INFERENCE_PROXY_REPO: 'tinfoilsh/confidential-inference-proxy',
  MAX_MESSAGES: 100,
  MAX_MESSAGE_LENGTH: 4000,
  MAX_DOCUMENT_SIZE_MB: 10,
  MAX_DOCUMENT_SIZE_BYTES: 10 * 1024 * 1024, // 10MB in bytes
  // Maximum number of messages to include in the context window (default, user can override in settings)
  MAX_PROMPT_MESSAGES: 15,
  // Voice recording timeout in milliseconds (30 seconds)
  RECORDING_TIMEOUT_MS: 30000,
  // Copy button timeout in milliseconds (2 seconds)
  COPY_TIMEOUT_MS: 2000,
  // Chat initialization delay in milliseconds
  CHAT_INIT_DELAY_MS: 300,
  // State update delay for async operations
  ASYNC_STATE_DELAY_MS: 50,
} as const
