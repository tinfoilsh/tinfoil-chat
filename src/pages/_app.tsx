import { AuthCleanupHandler } from '@/components/auth-cleanup-handler'
import { Toaster } from '@/components/ui/toaster'
import '@/styles/globals.css'
import '@/styles/tailwind.css'
import { ClerkProvider } from '@clerk/nextjs'
import { SpeedInsights } from '@vercel/speed-insights/next'
import type { AppProps } from 'next/app'
import { Inter } from 'next/font/google'
import localFont from 'next/font/local'
import Head from 'next/head'

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
      path: '../fonts/aeonikfono-regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../fonts/aeonikfono-medium.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../fonts/aeonikfono-bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-aeonik-fono',
  display: 'swap',
})

const aeonik = localFont({
  src: [
    {
      path: '../fonts/aeonik-regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../fonts/aeonik-regularitalic.woff2',
      weight: '400',
      style: 'italic',
    },
    {
      path: '../fonts/aeonik-semibold.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../fonts/aeonik-semibolditalic.woff2',
      weight: '600',
      style: 'italic',
    },
    {
      path: '../fonts/aeonik-bold.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../fonts/aeonik-bolditalic.woff2',
      weight: '700',
      style: 'italic',
    },
  ],
  variable: '--font-aeonik',
  display: 'swap',
})

const openDyslexic = localFont({
  src: [
    {
      path: '../fonts/OpenDyslexic-Regular.otf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../fonts/OpenDyslexic-Italic.otf',
      weight: '400',
      style: 'italic',
    },
    {
      path: '../fonts/OpenDyslexic-Bold.otf',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../fonts/OpenDyslexic-BoldItalic.otf',
      weight: '700',
      style: 'italic',
    },
  ],
  variable: '--font-opendyslexic',
  display: 'swap',
})

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Tinfoil Private Chat</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
      </Head>
      <style jsx global>{`
        :root {
          --font-sans: ${inter.style.fontFamily};
          --font-aeonik-fono: ${aeonikFono.style.fontFamily};
          --font-aeonik: ${aeonik.style.fontFamily};
          --font-opendyslexic: ${openDyslexic.style.fontFamily};
        }
      `}</style>
      <div
        className={`${inter.variable} ${aeonikFono.variable} ${aeonik.variable} ${openDyslexic.variable}`}
      >
        <SpeedInsights />
        <ClerkProvider telemetry={false} afterSignOutUrl="/">
          <AuthCleanupHandler />
          <Component {...pageProps} />
          <Toaster />
        </ClerkProvider>
      </div>
    </>
  )
}
