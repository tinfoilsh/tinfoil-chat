import { memo } from 'react'

const DEFAULT_WIDTH_PX = 36
const SMALL_WIDTH_PX = 22

export const LoadingDots = memo(function LoadingDots({
  isThinking = false,
  size = 'default',
}: {
  isThinking?: boolean
  size?: 'default' | 'small'
}) {
  const dotColor = isThinking ? 'currentColor' : 'hsl(var(--content-secondary))'
  const widthPx = size === 'small' ? SMALL_WIDTH_PX : DEFAULT_WIDTH_PX

  return (
    <div
      style={
        {
          width: `${widthPx}px`,
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
