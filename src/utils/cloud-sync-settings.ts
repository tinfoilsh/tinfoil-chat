export function isCloudSyncEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const setting = localStorage.getItem('cloudSyncEnabled')
    return setting === 'true'
  } catch {
    return false
  }
}

export function setCloudSyncEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('cloudSyncEnabled', enabled.toString())
    // Dispatch event to notify listeners of the change
    window.dispatchEvent(new Event('cloudSyncSettingChanged'))
  } catch {
    // Storage unavailable (e.g., Safari private mode) - silently fail
  }
}
