export const CONSTANTS = {
  LOADING_TIMEOUT: 500,
  MOBILE_BREAKPOINT: 768,
  SINGLE_SIDEBAR_BREAKPOINT: 1024, // Below this width, only one sidebar can be open at a time
  MAX_MESSAGES: 100,
  MAX_MESSAGE_LENGTH: 4000,
  MAX_DOCUMENT_SIZE_MB: 10,
  MAX_DOCUMENT_SIZE_BYTES: 10 * 1024 * 1024, // 10MB in bytes
  // Maximum number of messages to include in the context window (user can override in settings)
  MAX_PROMPT_MESSAGES: 75,
  MAX_PROMPT_MESSAGES_LIMIT: 200,
  // Voice recording timeout in milliseconds (30 seconds)
  RECORDING_TIMEOUT_MS: 30000,
  // Copy button timeout in milliseconds (2 seconds)
  COPY_TIMEOUT_MS: 2000,
  // Chat initialization delay in milliseconds
  CHAT_INIT_DELAY_MS: 300,
  // State update delay for async operations
  ASYNC_STATE_DELAY_MS: 50,
  // Sidebar widths
  CHAT_SIDEBAR_WIDTH_PX: 300,
  SETTINGS_SIDEBAR_WIDTH_PX: 345,
  VERIFIER_SIDEBAR_WIDTH_PX: 345,
  // Long text paste threshold (characters) - texts longer than this will be converted to .txt file
  LONG_PASTE_THRESHOLD: 3000,
  // System prompt for AI title generation
  TITLE_GENERATION_PROMPT: `You are a conversation title generator. Your job is to generate a title for the following conversation between the USER and the ASSISTANT. Generate a concise, descriptive title (max 15 tokens) for this conversation. Output ONLY the title, nothing else.`,
} as const
