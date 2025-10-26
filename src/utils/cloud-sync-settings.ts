export function isCloudSyncEnabled(): boolean {
  if (typeof window === 'undefined') return false
  const setting = localStorage.getItem('cloudSyncEnabled')
  return setting === 'true'
}

export function setCloudSyncEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('cloudSyncEnabled', enabled.toString())
}
