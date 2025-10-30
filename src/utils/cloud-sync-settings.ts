export function isCloudSyncEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (typeof localStorage === 'undefined') return false
    const setting = localStorage.getItem('cloudSyncEnabled')
    return setting === 'true'
  } catch {
    return false
  }
}

export function setCloudSyncEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem('cloudSyncEnabled', enabled.toString())
  } catch {
    // Silently fail when localStorage is not available
  }
}
