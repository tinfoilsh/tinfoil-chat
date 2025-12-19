/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',

  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },

  // Performance optimizations
  compress: true,
  poweredByHeader: false,

  // Optimize production builds
  productionBrowserSourceMaps: false,

  // Experimental performance features
  experimental: {
    optimizePackageImports: ['react-icons', 'lucide-react', '@heroicons/react'],
  },

  webpack: (config, { isServer }) => {
    // Disable webpack cache for production builds to avoid large cache files
    if (process.env.NODE_ENV === 'production') {
      config.cache = false
    }
    return config
  },

  // Proxy dev simulator to standalone server (only works in `next dev`, ignored in static export)
  async rewrites() {
    return [
      {
        source: '/api/dev/simulator',
        destination: 'http://localhost:3001/api/dev/simulator',
      },
    ]
  },
}

export default nextConfig
