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
  // Title generation settings
  TITLE_GENERATION_WORD_THRESHOLD: 100, // Words needed to trigger early title generation during streaming
  TITLE_GENERATION_PROMPT: `You are a title generator. Generate a concise, descriptive title or headline (max 5 words) for the following text blob. Output ONLY the title in plain text. NEVER output markdown.`,
  THOUGHT_SUMMARY_GENERATION_PROMPT: `You are a thoughts summarizer. Generate a title or headline (max 5 words) summarizing the following thought process using a few words only. Output ONLY the headline in plain text. NEVER output markdown.`,
} as const
