import { AuthCleanupHandler } from '@/components/auth-cleanup-handler'
import { Toaster } from '@/components/ui/toaster'
import '@/styles/tailwind.css'
import { ClerkProvider } from '@clerk/nextjs'
import { SpeedInsights } from '@vercel/speed-insights/next'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import localFont from 'next/font/local'
import Script from 'next/script'

export const runtime = 'nodejs'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
  preload: true,
  adjustFontFallback: true,
})

const aeonikFono = localFont({
  src: [
    {
      path: './fonts/aeonikfono-regular.woff2',
      weight: '400',
      style: 'normal',
    },
    { path: './fonts/aeonikfono-medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/aeonikfono-bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-aeonik-fono',
  display: 'swap',
})

const aeonik = localFont({
  src: [
    { path: './fonts/aeonik-regular.woff2', weight: '400', style: 'normal' },
    {
      path: './fonts/aeonik-regularitalic.woff2',
      weight: '400',
      style: 'italic',
    },
    { path: './fonts/aeonik-semibold.woff2', weight: '600', style: 'normal' },
    {
      path: './fonts/aeonik-semibolditalic.woff2',
      weight: '600',
      style: 'italic',
    },
    { path: './fonts/aeonik-bold.woff2', weight: '700', style: 'normal' },
    { path: './fonts/aeonik-bolditalic.woff2', weight: '700', style: 'italic' },
  ],
  variable: '--font-aeonik',
  display: 'swap',
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
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      {
        url: '/icon-light.png',
        media: '(prefers-color-scheme: light)',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/icon-dark.png',
        media: '(prefers-color-scheme: dark)',
        sizes: '192x192',
        type: 'image/png',
      },
    ],
    apple: [
      {
        url: '/apple-touch-icon-light.png',
        sizes: '180x180',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/apple-touch-icon-dark.png',
        sizes: '180x180',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/apple-touch-icon.png',
        sizes: '180x180',
      },
    ],
    other: [
      {
        rel: 'android-chrome',
        url: '/android-chrome-192x192.png',
        sizes: '192x192',
      },
      {
        rel: 'android-chrome',
        url: '/android-chrome-512x512.png',
        sizes: '512x512',
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
    <html
      lang="en"
      data-theme="light"
      className={`overflow-x-hidden ${inter.variable} ${aeonikFono.variable} ${aeonik.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://clerk.accounts.dev" />
        <link rel="dns-prefetch" href="https://plausible.io" />
        <link rel="manifest" href="/site.webmanifest" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#ffffff" />
      </head>
      <body className="font-aeonik-fono antialiased">
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
