import { AuthCleanupHandler } from '@/components/auth-cleanup-handler'
import { Toaster } from '@/components/ui/toaster'
import '@/styles/tailwind.css'
import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    template: '%s - Tinfoil Private Chat',
    default: 'Tinfoil Private Chat',
  },
  description:
    'Confidential AI chat application supporting multiple open source models through Tinfoil',
  keywords: [
    'AI chat',
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
      'Confidential AI chat application supporting multiple open source models through Tinfoil',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary',
    title: 'Tinfoil Private Chat',
    description:
      'Confidential AI chat application supporting multiple open source models through Tinfoil',
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
    <html lang="en" className="overflow-x-hidden">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#111827" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          defer
          data-domain="chat.tinfoil.sh"
          src="https://plausible.io/js/script.js"
        ></script>
      </head>
      <body className="bg-gray-900 text-gray-100 antialiased">
        <ClerkProvider telemetry={false} afterSignOutUrl="/">
          <AuthCleanupHandler />
          {children}
          <Toaster />
        </ClerkProvider>
      </body>
    </html>
  )
}
