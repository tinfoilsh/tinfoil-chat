import Link from 'next/link'

export default function Custom404() {
  return (
    <div className="flex h-screen items-center justify-center bg-surface-chat-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-content-primary">404</h1>
        <p className="mt-2 text-lg text-content-secondary">Page not found</p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg bg-button-send-background px-4 py-2 text-button-send-foreground transition-opacity hover:opacity-90"
        >
          Go back home
        </Link>
      </div>
    </div>
  )
}
