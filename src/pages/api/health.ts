import type { NextApiRequest, NextApiResponse } from 'next'

// Health check endpoint for monitoring services

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    })
  }

  if (req.method === 'HEAD') {
    return res.status(200).end()
  }

  // Method not allowed
  return res.status(405).end()
}
