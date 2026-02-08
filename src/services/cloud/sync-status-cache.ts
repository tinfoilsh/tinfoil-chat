/**
 * Generic cache for sync status stored in localStorage.
 * Provides a consistent load/save/invalidate pattern for any sync status type.
 */
export class SyncStatusCache<T> {
  private cached: T | null = null

  constructor(private storageKey: string) {}

  load(): T | null {
    if (this.cached) return this.cached
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(this.storageKey)
      if (raw) {
        this.cached = JSON.parse(raw)
        return this.cached
      }
    } catch {
      // Ignore parse errors
    }
    return null
  }

  save(status: T): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(status))
      this.cached = status
    } catch {
      // Ignore storage errors
    }
  }

  invalidate(): void {
    this.cached = null
  }

  clear(): void {
    this.cached = null
    if (typeof window === 'undefined') return
    try {
      localStorage.removeItem(this.storageKey)
    } catch {
      // Ignore storage errors
    }
  }
}
