import { Toaster } from '@/components/ui/toaster'
import '@/styles/tailwind.css'
import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import Script from 'next/script'

export const metadata: Metadata = {
  title: {
    template: '%s - Tinfoil',
    default: 'Tinfoil ⋅ Confidential AI',
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
    <ClerkProvider telemetry={false} afterSignOutUrl="/">
      <html lang="en" className="overflow-x-hidden">
        <head>
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
          />
          <meta name="theme-color" content="#111827" />
          <link
            rel="stylesheet"
            href="https://api.fontshare.com/css?f%5B%5D=switzer@400,500,600,700&amp;display=swap"
          />
          <Script
            defer
            data-domain="tinfoil.sh"
            src="https://plausible.io/js/script.js"
            strategy="afterInteractive"
          />
        </head>
        <body className="bg-gray-900 text-gray-900 antialiased">
          {children}
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  )
}
