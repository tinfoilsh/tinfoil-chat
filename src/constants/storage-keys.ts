// ---------------------------------------------------------------------------
// Centralized storage key constants for localStorage and sessionStorage.
// All keys use lowercase dash-case with a semantic prefix.
// ---------------------------------------------------------------------------

// --- localStorage: Sensitive values (encryption keys, passkey data) --------
export const SECRET_ENCRYPTION_KEY = 'tinfoil-secret-encryption-key'
export const SECRET_ENCRYPTION_KEY_HISTORY =
  'tinfoil-secret-encryption-key-history'
export const SECRET_PASSKEY_PRF_OUTPUT = 'tinfoil-secret-passkey-prf-output'
export const SECRET_PASSKEY_BACKED_UP = 'tinfoil-secret-passkey-backed-up'

// --- localStorage: Auth ----------------------------------------------------
export const AUTH_ACTIVE_USER_ID = 'tinfoil-auth-active-user-id'

// --- localStorage: App settings --------------------------------------------
export const SETTINGS_CLOUD_SYNC_ENABLED = 'tinfoil-settings-cloud-sync-enabled'
export const SETTINGS_CLOUD_SYNC_EXPLICITLY_DISABLED =
  'tinfoil-settings-cloud-sync-explicitly-disabled'
export const SETTINGS_HAS_SEEN_CLOUD_SYNC_MODAL =
  'tinfoil-settings-has-seen-cloud-sync-modal'
export const SETTINGS_SELECTED_MODEL = 'tinfoil-settings-selected-model'
export const SETTINGS_REASONING_EFFORT = 'tinfoil-settings-reasoning-effort'
export const SETTINGS_MAX_PROMPT_MESSAGES =
  'tinfoil-settings-max-prompt-messages'
export const SETTINGS_WEB_SEARCH_ENABLED = 'tinfoil-settings-web-search-enabled'
export const SETTINGS_PII_CHECK_ENABLED = 'tinfoil-settings-pii-check-enabled'
export const SETTINGS_THEME_MODE = 'tinfoil-settings-theme-mode'
export const SETTINGS_THEME = 'tinfoil-settings-theme'
export const SETTINGS_CHAT_FONT = 'tinfoil-settings-chat-font'
export const SETTINGS_CACHED_SUBSCRIPTION_STATUS =
  'tinfoil-settings-cached-subscription-status'
export const SETTINGS_HAS_SEEN_WEB_SEARCH_INTRO =
  'tinfoil-settings-has-seen-web-search-intro'

// --- localStorage: User personalization preferences ------------------------
export const USER_PREFS_NICKNAME = 'tinfoil-user-prefs-nickname'
export const USER_PREFS_PROFESSION = 'tinfoil-user-prefs-profession'
export const USER_PREFS_TRAITS = 'tinfoil-user-prefs-traits'
export const USER_PREFS_ADDITIONAL_CONTEXT =
  'tinfoil-user-prefs-additional-context'
export const USER_PREFS_LANGUAGE = 'tinfoil-user-prefs-language'
export const USER_PREFS_PERSONALIZATION_ENABLED =
  'tinfoil-user-prefs-personalization-enabled'
export const USER_PREFS_CUSTOM_PROMPT_ENABLED =
  'tinfoil-user-prefs-custom-prompt-enabled'
export const USER_PREFS_CUSTOM_SYSTEM_PROMPT =
  'tinfoil-user-prefs-custom-system-prompt'
export const USER_PREFS_PROJECT_UPLOAD = 'tinfoil-user-prefs-project-upload'

// --- localStorage: Sync/data state -----------------------------------------
export const SYNC_CHATS = 'tinfoil-sync-chats'
export const SYNC_CHAT_STATUS = 'tinfoil-sync-chat-status'
export const SYNC_ALL_CHATS_STATUS = 'tinfoil-sync-all-chats-status'
export const SYNC_PROJECT_CHAT_STATUS_PREFIX =
  'tinfoil-sync-project-chat-status-'

// --- localStorage: Development ---------------------------------------------
export const DEV_ENABLE_DEBUG_LOGS = 'tinfoil-dev-enable-debug-logs'

// --- sessionStorage: UI state ----------------------------------------------
export const UI_SIDEBAR_OPEN = 'tinfoil-ui-sidebar-open'
export const UI_SIDEBAR_ACTIVE_TAB = 'tinfoil-ui-sidebar-active-tab'
export const UI_SIDEBAR_PROJECTS_EXPANDED =
  'tinfoil-ui-sidebar-projects-expanded'
export const UI_SIDEBAR_CHAT_HISTORY_EXPANDED =
  'tinfoil-ui-sidebar-chat-history-expanded'
export const UI_SIDEBAR_EXPAND_SECTION = 'tinfoil-ui-sidebar-expand-section'
export const UI_EXPAND_PROJECTS_ON_MOUNT = 'tinfoil-ui-expand-projects-on-mount'
export const UI_EXPAND_PROJECT_DOCUMENTS = 'tinfoil-ui-expand-project-documents'

// --- sessionStorage: Sync --------------------------------------------------
export const SYNC_SESSION_CHATS = 'tinfoil-sync-session-chats'
export const SYNC_DELETED_CHATS = 'tinfoil-sync-deleted-chats'
