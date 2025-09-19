'use client'

import { Inconsolata } from 'next/font/google'

const INCONSOLATA_FONT = Inconsolata({
  subsets: ['latin'],
  weight: ['500'],
})

export function MdxButton({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{ display: 'flex', justifyContent: 'center', margin: '6rem 0' }}
    >
      <a
        href={href}
        className={`${INCONSOLATA_FONT.className} inline-flex items-center justify-center rounded-xl border border-border-subtle/15 bg-button-send-background px-8 py-4 text-2xl font-medium text-button-send-foreground no-underline transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl`}
      >
        {children}
      </a>
    </div>
  )
}
