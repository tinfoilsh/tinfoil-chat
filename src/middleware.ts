import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Define all routes requiring authentication
const isDashboardRoute = createRouteMatcher(['/dashboard(.*)'])
const isProtectedApiRoute = createRouteMatcher(['/api/billing(.*)'])

export default clerkMiddleware(async (auth, req) => {
  // Check hostname first for subdomain routing
  const hostname = req.headers.get('host')
  if (hostname === 'chat.localhost:3000' || hostname === 'chat.tinfoil.sh') {
    // Rewrite to /chat while keeping the URL as the original subdomain
    return NextResponse.rewrite(new URL('/chat', req.url))
  }

  // Check if user is authenticated for protected routes
  if (isDashboardRoute(req) || isProtectedApiRoute(req)) {
    // Use auth.protect() to handle authentication and redirection
    try {
      await auth.protect()
    } catch (error) {
      // auth.protect() will throw an error and redirect to the sign-in page
      return NextResponse.next()
    }
  }

  return NextResponse.next()
})

