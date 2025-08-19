/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Disable webpack cache for production builds to avoid large cache files
    if (process.env.NODE_ENV === 'production') {
      config.cache = false
    }
    return config
  },

  // Security headers configuration
  async headers() {
    // Skip headers in development
    if (process.env.NODE_ENV === 'development') {
      return []
    }

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' blob: https://plausible.io https://*.tinfoil.sh https://clerk.accounts.dev https://*.clerk.accounts.dev https://challenges.cloudflare.com https://tinfoilsh.github.io https://vercel.live",
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline' https://api.fontshare.com",
              "font-src 'self' https://api.fontshare.com data:",
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https://*.tinfoil.sh https://tinfoilsh.github.io https://plausible.io https://clerk.accounts.dev https://*.clerk.accounts.dev wss://*.clerk.accounts.dev",
              "frame-src 'self' https://vercel.live https://challenges.cloudflare.com https://clerk.accounts.dev https://*.clerk.accounts.dev",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              'upgrade-insecure-requests',
            ].join('; '),
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
}

export default nextConfig
