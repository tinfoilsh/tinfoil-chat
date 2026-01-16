import { memo } from 'react'

export const LoadingDots = memo(function LoadingDots({
  isThinking = false,
}: {
  isThinking?: boolean
}) {
  const dotColor = isThinking ? 'currentColor' : 'hsl(var(--content-secondary))'

  return (
    <div
      style={
        {
          height: '5px',
          aspectRatio: '5',
          '--_g': `no-repeat radial-gradient(farthest-side,${dotColor} 94%,transparent)`,
          background: 'var(--_g),var(--_g),var(--_g),var(--_g)',
          backgroundSize: '20% 100%',
          animation:
            'loading-dots-position .75s infinite alternate, loading-dots-flip 1.5s infinite alternate',
        } as React.CSSProperties
      }
    />
  )
})
