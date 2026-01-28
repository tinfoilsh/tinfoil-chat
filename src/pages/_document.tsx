import { Head, Html, Main, NextScript } from 'next/document'
import Script from 'next/script'

export default function Document() {
  // Inline script to set theme before first paint to prevent flash
  const themeScript = `
    (function() {
      var themeMode = localStorage.getItem('themeMode');
      var theme;

      // If no themeMode, check legacy 'theme' key
      if (!themeMode) {
        var legacyTheme = localStorage.getItem('theme');
        if (legacyTheme === 'dark' || legacyTheme === 'light') {
          themeMode = legacyTheme;
        }
      }

      if (themeMode === 'system' || !themeMode) {
        theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      } else {
        theme = themeMode;
      }

      document.documentElement.setAttribute('data-theme', theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    })();
  `

  return (
    <Html lang="en" data-theme="light" className="overflow-x-hidden">
      <Head>
        {/* Theme initialization script - must run before first paint */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Preconnect to external domains */}
        <link rel="preconnect" href="https://clerk.accounts.dev" />

        {/* PWA Manifest */}
        <link rel="manifest" href="/site.webmanifest" />

        {/* Theme color - adapts to light/dark mode */}
        <meta
          name="theme-color"
          content="#ffffff"
          media="(prefers-color-scheme: light)"
        />
        <meta
          name="theme-color"
          content="#121212"
          media="(prefers-color-scheme: dark)"
        />

        {/* Meta tags */}
        <meta
          name="description"
          content="Verifiably Private AI chat application supporting open source models through Tinfoil"
        />
        <meta
          name="keywords"
          content="AI chat, private AI, privacy, confidential computing, open source, secure AI, private chat"
        />
        <meta name="author" content="Tinfoil" />

        {/* Open Graph */}
        <meta property="og:title" content="Tinfoil Private Chat" />
        <meta
          property="og:description"
          content="Private AI chat application supporting open source models through Tinfoil"
        />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="en_US" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Tinfoil Private Chat" />
        <meta
          name="twitter:description"
          content="Private AI chat application supporting open source models through Tinfoil"
        />

        {/* Robots */}
        <meta name="robots" content="index, follow" />

        {/* Favicons */}
        <link
          rel="icon"
          href="/icon-light.png"
          media="(prefers-color-scheme: light)"
          type="image/png"
        />
        <link
          rel="icon"
          href="/icon-dark.png"
          media="(prefers-color-scheme: dark)"
          type="image/png"
        />

        {/* Apple Touch Icons */}
        <link
          rel="apple-touch-icon"
          href="/apple-touch-icon-light.png"
          sizes="180x180"
          media="(prefers-color-scheme: light)"
        />
        <link
          rel="apple-touch-icon"
          href="/apple-touch-icon-dark.png"
          sizes="180x180"
          media="(prefers-color-scheme: dark)"
        />
        <link
          rel="apple-touch-icon"
          href="/apple-touch-icon.png"
          sizes="180x180"
        />

        {/* Android Chrome Icons */}
        <link rel="icon" href="/android-chrome-192x192.png" sizes="192x192" />
        <link rel="icon" href="/android-chrome-512x512.png" sizes="512x512" />

        {/* Plausible Analytics */}
        <Script
          defer
          data-domain="chat.tinfoil.sh"
          data-api="https://plausible.io/api/event"
          src="/js/plausible.js"
          integrity="sha384-2koU+A5hG/EjBLH1x5k5ThN+dPO7wtgAfkwcsSgQq3kNc0ouUd56j17YOJ0aE0yv"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      </Head>
      <body className="font-aeonik-fono antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
