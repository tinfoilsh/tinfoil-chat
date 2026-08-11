import { logError } from '@/utils/error-handling'

interface TokenReadOptions {
  skipCache?: boolean
}

type TokenGetter = (options?: TokenReadOptions) => Promise<string | null>

export class AuthTokenUnavailableError extends Error {
  constructor(
    public readonly reason: 'not-initialized' | 'unavailable',
    options?: ErrorOptions,
  ) {
    super(
      reason === 'not-initialized'
        ? 'Authentication is not initialized'
        : 'Authentication token is unavailable',
      options,
    )
    this.name = 'AuthTokenUnavailableError'
  }
}

export class AuthTokenRefreshError extends Error {
  constructor(options?: ErrorOptions) {
    super('Authentication token refresh failed', options)
    this.name = 'AuthTokenRefreshError'
  }
}

export class AuthTokenManager {
  private getToken: TokenGetter | null = null
  private initResolvers: Array<() => void> = []
  private refreshByRejectedToken = new Map<string, Promise<string>>()
  private persistentAuthHandler: (() => Promise<void>) | null = null
  private persistentAuthHandlerPromise: Promise<void> | null = null
  private generation = 0

  initialize(getToken: TokenGetter) {
    if (this.getToken !== getToken) {
      this.generation++
      this.refreshByRejectedToken.clear()
    }
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
      let settled = false
      const resolver = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(true)
      }
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        this.initResolvers = this.initResolvers.filter((r) => r !== resolver)
        resolve(false)
      }, timeoutMs)
      this.initResolvers.push(resolver)
    })
  }

  async getValidToken(): Promise<string> {
    const getToken = this.getToken
    const generation = this.generation
    if (!getToken) {
      throw new AuthTokenUnavailableError('not-initialized')
    }
    let token: string | null
    try {
      token = await getToken()
    } catch (error) {
      throw new AuthTokenUnavailableError('unavailable', { cause: error })
    }
    if (generation !== this.generation) {
      throw new AuthTokenUnavailableError('unavailable')
    }
    if (!token) {
      throw new AuthTokenUnavailableError('unavailable')
    }
    return token
  }

  refreshToken(rejectedToken: string): Promise<string> {
    const existing = this.refreshByRejectedToken.get(rejectedToken)
    if (existing) return existing

    const refresh = this.readFreshToken().finally(() => {
      if (this.refreshByRejectedToken.get(rejectedToken) === refresh) {
        this.refreshByRejectedToken.delete(rejectedToken)
      }
    })
    this.refreshByRejectedToken.set(rejectedToken, refresh)
    return refresh
  }

  registerPersistentAuthHandler(handler: () => Promise<void>): () => void {
    this.persistentAuthHandler = handler
    return () => {
      if (this.persistentAuthHandler === handler) {
        this.persistentAuthHandler = null
      }
    }
  }

  handlePersistentAuthFailure(): void {
    if (this.persistentAuthHandlerPromise || !this.persistentAuthHandler) return

    const handler = this.persistentAuthHandler
    const promise = Promise.resolve()
      .then(handler)
      .catch((error) => {
        logError(
          'Failed to sign out after persistent authentication failure',
          error,
          {
            component: 'AuthTokenManager',
            action: 'handlePersistentAuthFailure',
          },
        )
      })
      .finally(() => {
        this.persistentAuthHandlerPromise = null
      })
    this.persistentAuthHandlerPromise = promise
  }

  reset(): void {
    this.generation++
    this.getToken = null
    this.refreshByRejectedToken.clear()
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getValidToken()
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      return !!(await this.getValidToken())
    } catch {
      return false
    }
  }

  private async readFreshToken(): Promise<string> {
    const getToken = this.getToken
    const generation = this.generation
    if (!getToken) {
      throw new AuthTokenRefreshError({
        cause: new AuthTokenUnavailableError('not-initialized'),
      })
    }

    try {
      const token = await getToken({ skipCache: true })
      if (generation !== this.generation) {
        throw new AuthTokenUnavailableError('unavailable')
      }
      if (!token) {
        throw new AuthTokenUnavailableError('unavailable')
      }
      return token
    } catch (error) {
      throw new AuthTokenRefreshError({ cause: error })
    }
  }
}

export const authTokenManager = new AuthTokenManager()
