import { simulateStream } from '@/utils/dev-simulator'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  // Only allow in development environment
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const body = await req.json()
    const messages = body.messages || []

    // Get the last user message
    const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop()

    if (!lastUserMessage) {
      return new Response('No user message found', { status: 400 })
    }

    // Extract query from the message
    const query = lastUserMessage.content || ''

    // Create a TransformStream for streaming response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        // Set up abort handling
        const abortHandler = () => {
          controller.close()
        }

        // Listen for client disconnect
        req.signal.addEventListener('abort', abortHandler)

        try {
          // Use the simulator to generate streaming response
          for await (const chunk of simulateStream(query)) {
            // Check if client has disconnected
            if (req.signal.aborted) {
              break
            }
            controller.enqueue(encoder.encode(chunk))
          }
          controller.close()
        } catch (error) {
          controller.error(error)
        } finally {
          // Clean up event listener
          req.signal.removeEventListener('abort', abortHandler)
        }
      },
    })

    // Return streaming response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Dev simulator error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}

// Only allow POST requests
export async function GET() {
  // Return 404 in production to hide the endpoint
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return new Response('Method not allowed', { status: 405 })
}
