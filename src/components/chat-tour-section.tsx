'use client'

import { Container } from '@/components/container'

export function ArcadeEmbed() {
  return (
    <div style={{ position: 'relative', paddingBottom: 'calc(64.64120370370371% + 41px)', height: 0, width: '100%' }}>
      <iframe
        src="https://demo.arcade.software/hos7yfPtCMRnZqlMWghZ?embed&embed_mobile=inline&embed_desktop=inline&show_copy_link=true"
        title="Tinfoil Chat Security Flow"
        frameBorder="0"
        loading="lazy"
        allowFullScreen
        allow="clipboard-write"
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', colorScheme: 'light' }}
      />
    </div>
  )
}

export function ChatTourSection() {
  return (
    <Container>
      <div className="bg-grid-gray-100/50 absolute inset-0 bg-[size:30px_30px] [mask-image:linear-gradient(0deg,transparent,black,transparent)]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-20 flex max-w-3xl flex-col items-center">
          <h2 className="text-center text-4xl font-bold tracking-tight sm:text-5xl">
            Tour of the Private Chat
          </h2>
          <p className="mt-6 text-center text-xl">
            See how our confidential chat works to keep your conversations completely private.
          </p>
        </div>

        <div>
          <ArcadeEmbed />
        </div>
      </div>
    </Container>
  )
} 