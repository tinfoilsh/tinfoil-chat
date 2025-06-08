import type { AIModel } from './types'

const VERIFIER_VERSION = 'v0.0.6'

export const CONSTANTS = {
  LOADING_TIMEOUT: 500,
  MOBILE_BREAKPOINT: 768,
  DEFAULT_MODEL: 'llama3-3-70b' as AIModel,
  DEFAULT_FREE_MODEL: 'llama3-3-70b' as AIModel,
  VERIFIER_VERSION,
  VERIFIER_WASM_URL: `https://tinfoilsh.github.io/verifier-js/tinfoil-verifier-${VERIFIER_VERSION}.wasm`,
  MAX_MESSAGES: 100,
  MAX_MESSAGE_LENGTH: 4000,
  MAX_DOCUMENT_SIZE_MB: 10,
  MAX_DOCUMENT_SIZE_BYTES: 10 * 1024 * 1024, // 10MB in bytes
  WHISPER_ENDPOINT:
    'https://audio-processing.model.tinfoil.sh/v1/audio/transcriptions',
} as const
