import { logError } from '@/utils/error-handling'

type TokenGetter = () => Promise<string | null>

class AuthTokenManager {
  private getToken: TokenGetter | null = null
  private initResolvers: Array<() => void> = []

  initialize(getToken: TokenGetter) {
    this.getToken = getToken
    for (const resolve of this.initResolvers) {
      resolve()
    }
    this.initResolvers = []
  }

  isInitialized(): boolean {
    return this.getToken !== null
  }

  /**
   * Returns a promise that resolves to `true` when `initialize()` is called,
   * or `false` if the timeout expires first.  If already initialized,
   * resolves immediately.
   */
  waitForInit(timeoutMs: number): Promise<boolean> {
    if (this.getToken !== null) return Promise.resolve(true)
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs)
      this.initResolvers.push(() => {
        clearTimeout(timer)
        resolve(true)
      })
    })
  }

  async getValidToken(): Promise<string> {
    if (!this.getToken) {
      throw new Error('Auth not initialized')
    }
    const token = await this.getToken()
    if (!token) {
      throw new Error('Failed to get authentication token')
    }
    return token
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getValidToken()
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  }

  async isAuthenticated(): Promise<boolean> {
    if (!this.getToken) return false
    try {
      const token = await this.getToken()
      return !!token
    } catch {
      return false
    }
  }

  async withAuthRetry<T>(
    operation: () => Promise<T>,
    context?: string,
  ): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (this.isAuthError(error)) {
        logError(`Auth error in ${context}, retrying with fresh token`, error)
        // Call getToken again - Clerk will refresh if the token is expired
        await this.getValidToken()
        return await operation()
      }
      throw error
    }
  }

  private isAuthError(error: unknown): boolean {
    if (error instanceof Response && error.status === 401) return true
    if (error instanceof Error) {
      const msg = error.message.toLowerCase()
      return msg.includes('401') || msg.includes('unauthorized')
    }
    return false
  }
}

export const authTokenManager = new AuthTokenManager()
