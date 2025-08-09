'use client'

import { motion, useAnimationControls, useReducedMotion } from 'framer-motion'
import { memo, useEffect } from 'react'

export const LockAnimation = memo(function LockAnimation({
  isDarkMode,
  size = 120,
}: {
  isDarkMode: boolean
  size?: number
}) {
  const shackleControls = useAnimationControls()
  const bodyControls = useAnimationControls()
  const lockControls = useAnimationControls()
  const shouldReduceMotion = useReducedMotion()

  // Geometry
  // High contrast lock: white in dark mode, near-black in light mode
  const fillColor = isDarkMode ? '#ffffff' : '#111827'
  const OPEN_D = 'M18 48 V20 a14 14 0 0 1 28 0 V24'
  const CLOSED_D = 'M18 40 V16 a14 14 0 0 1 28 0 V40'

  useEffect(() => {
    const run = async () => {
      if (shouldReduceMotion) {
        await shackleControls.start({
          y: 0,
          d: CLOSED_D,
          transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
        })
      } else {
        await shackleControls.start({
          y: 0,
          d: CLOSED_D,
          transition: {
            type: 'spring',
            stiffness: 1200,
            damping: 16,
            mass: 0.55,
          },
        })

        bodyControls.start({
          y: [0, 0.7, 0, 0.3, 0],
          scaleY: [1, 0.99, 1.004, 0.998, 1],
          transition: { duration: 0.3, ease: 'easeOut' },
        })

        await lockControls.start({
          rotate: [0, -1.8, 1.6, -1.2, 0.6, -0.3, 0],
          x: [0, -1.0, 0.9, -0.6, 0.3, -0.15, 0],
          transition: { duration: 0.6, ease: 'easeOut', delay: 0.02 },
        })
      }
    }

    // Immediately render the full lock in an open state so nothing "pops in" late
    bodyControls.set({ opacity: 1, y: 0, scale: 1 })
    shackleControls.set({ y: -8, d: OPEN_D })
    lockControls.set({ rotate: 0, x: 0, opacity: 1 })
    const timer = setTimeout(run, 1000)
    return () => clearTimeout(timer)
  }, [bodyControls, shackleControls, lockControls, shouldReduceMotion])

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        initial={false}
        aria-label="Locking animation"
        style={{ overflow: 'visible' }}
      >
        <motion.g
          animate={lockControls}
          style={{ originX: '32px', originY: '44px' }}
        >
          <defs>
            <clipPath id="body-clip">
              <rect x="0" y="24" width="64" height="40" />
            </clipPath>
            <mask id="body-hole-mask" maskUnits="userSpaceOnUse">
              <rect x="0" y="0" width="64" height="64" fill="white" />
              <circle cx="32" cy="44" r="5.2" fill="black" />
            </mask>
          </defs>

          {/* Shackle */}
          <motion.g
            animate={shackleControls}
            initial={false}
            style={{ originX: '40px', originY: '24px' }}
          >
            <motion.path
              animate={shackleControls}
              d={OPEN_D}
              fill="none"
              stroke={fillColor}
              strokeWidth={7}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.g>

          {/* Body with transparent keyhole via mask */}
          <motion.path
            animate={bodyControls}
            clipPath="url(#body-clip)"
            mask="url(#body-hole-mask)"
            fill={fillColor}
            d="M52,24h-4v-8c0-8.836-7.164-16-16-16S16,7.164,16,16v8h-4c-2.211,0-4,1.789-4,4v32c0,2.211,1.789,4,4,4h40 c2.211,0,4-1.789,4-4V28C56,25.789,54.211,24,52,24z M40,24 H24v-8c0-4.418,3.582-8,8-8s8,3.582,8,8V24z"
          />
        </motion.g>
      </motion.svg>
    </div>
  )
})
