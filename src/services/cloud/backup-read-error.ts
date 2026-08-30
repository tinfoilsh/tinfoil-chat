export type CloudBackupReadCategory =
  'item_unavailable' | 'item_invalid' | 'key_unavailable'

export class CloudBackupReadError extends Error {
  constructor(
    public readonly category: CloudBackupReadCategory,
    public readonly reason: string,
    public readonly omittable: boolean,
    options?: ErrorOptions,
  ) {
    super('Cloud backup source could not be read', options)
    this.name = 'CloudBackupReadError'
  }
}
