/**
 * Error handling utilities for production-ready logging
 */

type LogLevel = 'error' | 'warn' | 'info' | 'debug'

interface ErrorContext {
  component?: string
  action?: string
  userId?: string
  metadata?: Record<string, unknown>
}

/**
 * Log an error with context - replace console.error calls with this
 */
export function logError(
  message: string,
  error?: Error | unknown,
  context?: ErrorContext,
): void {
  // In development, still log to console for debugging
  if (process.env.NODE_ENV === 'development') {
    console.error(`[${context?.component || 'Unknown'}] ${message}`, error)
    return
  }

  // In production, you would send to your logging service
  // For now, we'll silently handle errors to avoid console spam
  const errorInfo = {
    level: 'error' as LogLevel,
    message,
    error:
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : error,
    context,
    timestamp: new Date().toISOString(),
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    userAgent:
      typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
  }

  // TODO: Send to actual logging service (e.g., Sentry, LogRocket, etc.)
  // logToService(errorInfo)
}

/**
 * Log a warning - replace console.warn calls with this
 */
export function logWarning(message: string, context?: ErrorContext): void {
  const debugEnabled =
    typeof window !== 'undefined' &&
    localStorage.getItem('enableDebugLogs') === 'true'

  if (process.env.NODE_ENV === 'development' || debugEnabled) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0]
    console.warn(
      `[${timestamp}] [${context?.component || 'Unknown'}] ${message}`,
      context?.metadata || '',
    )
    return
  }

  // TODO: Send to logging service
}

/**
 * Log info - replace console.log calls with this
 *
 * To enable in production, run in browser console:
 * localStorage.setItem('enableDebugLogs', 'true')
 *
 * To disable:
 * localStorage.removeItem('enableDebugLogs')
 */
export function logInfo(message: string, context?: ErrorContext): void {
  const debugEnabled =
    typeof window !== 'undefined' &&
    localStorage.getItem('enableDebugLogs') === 'true'

  if (process.env.NODE_ENV === 'development' || debugEnabled) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0]
    console.log(
      `[${timestamp}] [${context?.component || 'Unknown'}] ${message}`,
      context?.metadata || '',
    )
    return
  }

  // TODO: Send to logging service
}

/**
 * Handle and log errors with user-friendly fallback
 */
export function handleError(
  error: Error | unknown,
  fallbackMessage: string,
  context?: ErrorContext,
): string {
  logError(fallbackMessage, error, context)

  // Return user-friendly message
  if (error instanceof Error) {
    return error.message || fallbackMessage
  }

  return fallbackMessage
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
