const PREFERENCE_KEY = 'projectUploadPreference'

export type ProjectUploadPreference = 'project' | 'chat'

export function getProjectUploadPreference(): ProjectUploadPreference | null {
  if (typeof window === 'undefined') return null
  try {
    const value = localStorage.getItem(PREFERENCE_KEY)
    if (value === 'project' || value === 'chat') {
      return value
    }
    return null
  } catch {
    return null
  }
}

export function setProjectUploadPreference(
  preference: ProjectUploadPreference,
): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PREFERENCE_KEY, preference)
  } catch {
    // Storage unavailable (e.g., Safari private mode) - silently fail
  }
}

export function clearProjectUploadPreference(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(PREFERENCE_KEY)
  } catch {
    // Storage unavailable - silently fail
  }
}
