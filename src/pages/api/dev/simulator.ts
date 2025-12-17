import { simulateStream } from '@/utils/dev-simulator'
import type { NextApiRequest, NextApiResponse } from 'next'

// Disable body size limit and automatic body parsing for streaming
export const config = {
  api: {
    responseLimit: false,
  },
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Only allow in development environment
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ error: 'Not found' })
  }

  if (req.method === 'GET') {
    return res.status(405).send('Method not allowed')
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = req.body
    const messages = body.messages || []

    // Get the last user message
    const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop()

    if (!lastUserMessage) {
      return res.status(400).send('No user message found')
    }

    // Extract query from the message
    const query = lastUserMessage.content || ''

    // Set up streaming response headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering
    res.setHeader('Content-Encoding', 'none') // Prevent compression

    // Disable Nagle's algorithm to send packets immediately
    if (req.socket) {
      req.socket.setNoDelay(true)
    }

    // Set status and flush headers immediately
    res.status(200)
    res.flushHeaders()

    // Handle client disconnect
    req.on('close', () => {
      res.end()
    })

    try {
      // Stream the response
      for await (const chunk of simulateStream(query)) {
        // Check if client disconnected
        if (req.socket.destroyed) {
          break
        }
        res.write(chunk)
        // Flush immediately to ensure chunks are sent without buffering
        if (typeof (res as any).flush === 'function') {
          ;(res as any).flush()
        }
      }
      res.end()
    } catch (error) {
      console.error('Dev simulator streaming error:', error)
      if (!res.writableEnded) {
        res.end()
      }
    }
  } catch (error) {
    console.error('Dev simulator error:', error)
    if (!res.headersSent) {
      return res.status(500).send('Internal server error')
    }
  }
}
