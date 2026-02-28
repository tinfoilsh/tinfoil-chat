// ---------------------------------------------------------------------------
// One-time migration of localStorage/sessionStorage keys from legacy names
// to the new standardized dash-case names with semantic prefixes.
// ---------------------------------------------------------------------------

const MIGRATION_FLAG = 'tinfoil-storage-migrated'

const LOCAL_STORAGE_KEY_MAP: Record<string, string> = {
  // Sensitive
  'tinfoil-encryption-key': 'tinfoil-secret-encryption-key',
  'tinfoil-encryption-key-history': 'tinfoil-secret-encryption-key-history',
  'tinfoil-passkey-prf-cache': 'tinfoil-secret-passkey-prf-output',
  'tinfoil-passkey-backed-up': 'tinfoil-secret-passkey-backed-up',

  // Auth
  'tinfoil-active-user-id': 'tinfoil-auth-active-user-id',

  // Settings
  cloudSyncEnabled: 'tinfoil-settings-cloud-sync-enabled',
  cloudSyncExplicitlyDisabled:
    'tinfoil-settings-cloud-sync-explicitly-disabled',
  hasSeenCloudSyncModal: 'tinfoil-settings-has-seen-cloud-sync-modal',
  selectedModel: 'tinfoil-settings-selected-model',
  reasoningEffort: 'tinfoil-settings-reasoning-effort',
  maxPromptMessages: 'tinfoil-settings-max-prompt-messages',
  webSearchEnabled: 'tinfoil-settings-web-search-enabled',
  piiCheckEnabled: 'tinfoil-settings-pii-check-enabled',
  themeMode: 'tinfoil-settings-theme-mode',
  theme: 'tinfoil-settings-theme',
  chatFont: 'tinfoil-settings-chat-font',
  enableDebugLogs: 'tinfoil-dev-enable-debug-logs',

  // User preferences
  userNickname: 'tinfoil-user-prefs-nickname',
  userProfession: 'tinfoil-user-prefs-profession',
  userTraits: 'tinfoil-user-prefs-traits',
  userAdditionalContext: 'tinfoil-user-prefs-additional-context',
  userLanguage: 'tinfoil-user-prefs-language',
  isUsingPersonalization: 'tinfoil-user-prefs-personalization-enabled',
  isUsingCustomPrompt: 'tinfoil-user-prefs-custom-prompt-enabled',
  customSystemPrompt: 'tinfoil-user-prefs-custom-system-prompt',
  projectUploadPreference: 'tinfoil-user-prefs-project-upload',

  // Sync/data
  chats: 'tinfoil-sync-chats',
  'tinfoil-chat-sync-status': 'tinfoil-sync-chat-status',
  'tinfoil-all-chats-sync-status': 'tinfoil-sync-all-chats-status',
}

const SESSION_STORAGE_KEY_MAP: Record<string, string> = {
  tinfoil_session_chats: 'tinfoil-sync-session-chats',
  'tinfoil-deleted-chats': 'tinfoil-sync-deleted-chats',
  sidebarOpen: 'tinfoil-ui-sidebar-open',
  chatSidebarActiveTab: 'tinfoil-ui-sidebar-active-tab',
  sidebarProjectsExpanded: 'tinfoil-ui-sidebar-projects-expanded',
  sidebarChatHistoryExpanded: 'tinfoil-ui-sidebar-chat-history-expanded',
  sidebarExpandSection: 'tinfoil-ui-sidebar-expand-section',
  expandProjectsOnMount: 'tinfoil-ui-expand-projects-on-mount',
  expandProjectDocuments: 'tinfoil-ui-expand-project-documents',
}

function migrateStorage(
  storage: Storage,
  keyMap: Record<string, string>,
): void {
  for (const [oldKey, newKey] of Object.entries(keyMap)) {
    const value = storage.getItem(oldKey)
    if (value !== null && storage.getItem(newKey) === null) {
      storage.setItem(newKey, value)
    }
    if (value !== null) {
      storage.removeItem(oldKey)
    }
  }
}

export function migrateStorageKeys(): void {
  if (typeof window === 'undefined') return

  try {
    if (localStorage.getItem(MIGRATION_FLAG) === 'true') return

    migrateStorage(localStorage, LOCAL_STORAGE_KEY_MAP)
    migrateStorage(sessionStorage, SESSION_STORAGE_KEY_MAP)

    localStorage.setItem(MIGRATION_FLAG, 'true')
  } catch {
    // best-effort — don't break the app if storage is unavailable
  }
}
