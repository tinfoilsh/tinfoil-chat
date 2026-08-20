export const NATIVE_BACKUP_FORMAT = 'tinfoil-native-backup' as const
export const NATIVE_BACKUP_VERSION = 1 as const

export const NATIVE_BACKUP_ENTITY_KINDS = [
  'projects',
  'project_documents',
  'cloud_chats',
  'local_chats',
  'relationships',
  'images',
] as const

export type NativeBackupEntityKind = (typeof NATIVE_BACKUP_ENTITY_KINDS)[number]
