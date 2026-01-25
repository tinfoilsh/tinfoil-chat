import { logError } from '@/utils/error-handling'

type TokenGetter = () => Promise<string | null>

class AuthTokenManager {
  private getToken: TokenGetter | null = null

  initialize(getToken: TokenGetter) {
    this.getToken = getToken
  }

  isInitialized(): boolean {
    return this.getToken !== null
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

  async getAuthHeaders(): Promise<HeadersInit> {
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
