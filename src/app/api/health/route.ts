import { NextResponse } from 'next/server'

// Health check endpoint for monitoring services
// Explicitly NOT using edge runtime to support HEAD requests

export async function GET() {
  return NextResponse.json(
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  )
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 })
}
