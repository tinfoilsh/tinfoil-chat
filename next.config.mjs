/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Disable webpack cache for production builds to avoid large cache files
    if (process.env.NODE_ENV === 'production') {
      config.cache = false;
    }
    return config;
  },
}

export default nextConfig;
