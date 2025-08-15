import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Define which routes should be protected
const isProtectedRoute = createRouteMatcher(['/api/billing(.*)'])

export default clerkMiddleware(async (auth, req) => {
  // Protect API routes
  if (isProtectedRoute(req)) {
    await auth.protect()
  }

  // Create response with security headers
  const response = NextResponse.next()

  const isDevelopment = process.env.NODE_ENV === 'development'

  // In development, allow everything for smooth DX
  if (isDevelopment) {
    // Skip all security headers in development to avoid conflicts
    return response
  }

  // Production CSP - strict security
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://plausible.io https://clerk.accounts.dev https://*.clerk.accounts.dev https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://api.fontshare.com",
    "font-src 'self' https://api.fontshare.com data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://api.tinfoil.sh https://plausible.io https://clerk.accounts.dev https://*.clerk.accounts.dev wss://*.clerk.accounts.dev",
    "frame-src 'self' https://challenges.cloudflare.com https://clerk.accounts.dev https://*.clerk.accounts.dev",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ')

  // Apply security headers in production only
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  )
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload',
  )

  return response
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
