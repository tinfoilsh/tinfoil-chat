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
          width: '36px',
          aspectRatio: '4',
          '--_g': `no-repeat radial-gradient(circle closest-side,${dotColor} 90%,transparent)`,
          background: 'var(--_g) 0% 50%, var(--_g) 50% 50%, var(--_g) 100% 50%',
          backgroundSize: 'calc(100%/3) 100%',
          animation: 'loading-dots 1s infinite linear',
        } as React.CSSProperties
      }
    />
  )
})
