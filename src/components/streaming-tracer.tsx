import { memo } from 'react'

export const StreamingTracer = memo(function StreamingTracer() {
  return (
    <div
      aria-hidden="true"
      style={
        {
          width: '36px',
          aspectRatio: '4',
          background:
            'radial-gradient(circle closest-side, currentColor 90%, transparent) 0 / calc(100% / 3) 100% no-repeat',
          animation: 'streaming-tracer 1s steps(3) infinite',
        } as React.CSSProperties
      }
    />
  )
})
