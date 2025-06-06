import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {}

const config = withSentryConfig(nextConfig, {
    org: "tinfoil",
    project: "landing-site",
    // Only print logs for uploading source maps in CI
    // Set to `true` to suppress logs
    silent: !process.env.CI,
    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,
});

export default config;
