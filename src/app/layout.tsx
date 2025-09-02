import { AuthCleanupHandler } from '@/components/auth-cleanup-handler'
import { Toaster } from '@/components/ui/toaster'
import '@/styles/tailwind.css'
import { ClerkProvider } from '@clerk/nextjs'
import { SpeedInsights } from '@vercel/speed-insights/next'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'

export const runtime = 'nodejs'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  preload: true,
  adjustFontFallback: true,
})

export const metadata: Metadata = {
  title: {
    template: '%s - Tinfoil Private Chat',
    default: 'Tinfoil Private Chat',
  },
  description:
    'Verifiably Private AI chat application supporting open source models through Tinfoil',
  keywords: [
    'AI chat',
    'private AI',
    'privacy',
    'confidential computing',
    'open source',
    'secure AI',
    'private chat',
  ],
  authors: [{ name: 'Tinfoil' }],
  creator: 'Tinfoil',
  openGraph: {
    title: 'Tinfoil Private Chat',
    description:
      'Private AI chat application supporting open source models through Tinfoil',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary',
    title: 'Tinfoil Private Chat',
    description:
      'Private AI chat application supporting open source models through Tinfoil',
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      {
        url: '/icon-light.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark.png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    apple: [
      {
        url: '/apple-touch-icon-light.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/apple-touch-icon-dark.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/apple-touch-icon.png', // Fallback for browsers that don't support media queries
      },
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`overflow-x-hidden ${inter.variable}`}>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://clerk.accounts.dev" />
        <link rel="dns-prefetch" href="https://plausible.io" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#111827" />
      </head>
      <body
        className={`bg-gray-900 text-gray-100 antialiased ${inter.className}`}
      >
        <Script
          defer
          data-domain="chat.tinfoil.sh"
          src="https://plausible.io/js/script.js"
          strategy="afterInteractive"
        />
        <ClerkProvider telemetry={false} afterSignOutUrl="/">
          <AuthCleanupHandler />
          {children}
          <Toaster />
          <SpeedInsights />
        </ClerkProvider>
      </body>
    </html>
  )
}
