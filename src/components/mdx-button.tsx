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
        style={{
          padding: '1rem 2rem',
          backgroundColor: '#111827',
          color: 'white',
          borderRadius: '0.5rem',
          textDecoration: 'none',
          fontWeight: '500',
          fontSize: '1.5rem',
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid rgba(255,255,255,0.1)',
          transition: 'all 0.2s ease-in-out',
          boxShadow: '0 0 0 rgba(17,24,39,0)',
        }}
        className={INCONSOLATA_FONT.className}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 0 20px rgba(17,24,39,0.8)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = '0 0 0 rgba(17,24,39,0)'
        }}
      >
        {children}
      </a>
    </div>
  )
}
