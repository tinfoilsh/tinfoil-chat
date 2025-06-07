import { Toaster } from '@/components/ui/toaster'
import '@/styles/tailwind.css'
import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'

export const metadata: Metadata = {
  title: {
    template: '%s - Tinfoil Chat',
    default: 'Tinfoil Chat',
  },
  description: 'Experience confidential AI chat with multiple models, powered by Tinfoil\'s secure infrastructure.',
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
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/css?f%5B%5D=switzer@400,500,600,700&amp;display=swap"
        />
      </head>
      <body className="bg-gray-900 text-gray-900 antialiased">
        <ClerkProvider 
          telemetry={false} 
          afterSignOutUrl="/"
          appearance={{
            elements: {
              formButtonPrimary: 'bg-emerald-500 hover:bg-emerald-600',
              card: 'bg-gray-800',
            }
          }}
        >
          {children}
          <Toaster />
        </ClerkProvider>
      </body>
    </html>
  )
}
