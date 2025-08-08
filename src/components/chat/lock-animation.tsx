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
  const fillColor = isDarkMode ? '#e5e7eb' : '#111827'
  const OPEN_D = 'M18 48 V20 a14 14 0 0 1 28 0 V24'
  const CLOSED_D = 'M18 40 V16 a14 14 0 0 1 28 0 V40'

  useEffect(() => {
    const run = async () => {
      await bodyControls.start({
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
      })

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

        lockControls.set({ rotate: 0, x: 0 })
        await lockControls.start({
          rotate: [0, -1.2, 1.1, -0.8, 0.4, -0.2, 0],
          x: [0, -0.7, 0.6, -0.4, 0.2, -0.1, 0],
          transition: { duration: 0.5, ease: 'easeOut', delay: 0.02 },
        })
      }
    }

    bodyControls.set({ opacity: 0, y: 8, scale: 0.995 })
    shackleControls.set({ y: -8, d: OPEN_D })
    lockControls.set({ rotate: 0, x: 0 })
    run()
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

          {/* Body */}
          <motion.path
            animate={bodyControls}
            clipPath="url(#body-clip)"
            fill={fillColor}
            d="M52,24h-4v-8c0-8.836-7.164-16-16-16S16,7.164,16,16v8h-4c-2.211,0-4,1.789-4,4v32c0,2.211,1.789,4,4,4h40 c2.211,0,4-1.789,4-4V28C56,25.789,54.211,24,52,24z M40,24 H24v-8c0-4.418,3.582-8,8-8s8,3.582,8,8V24z"
          />
        </motion.g>
      </motion.svg>
    </div>
  )
})
