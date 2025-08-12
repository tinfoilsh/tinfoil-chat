'use client'

import { ShieldCheckIcon } from '@heroicons/react/24/outline'
import { motion } from 'framer-motion'
import { memo } from 'react'

export const LockAnimation = memo(function LockAnimation({
  isDarkMode,
  size = 120,
}: {
  isDarkMode: boolean
  size?: number
}) {
  return (
    <motion.div
      className="relative"
      style={{ width: size, height: size }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <ShieldCheckIcon
        className={isDarkMode ? 'text-gray-100' : 'text-gray-800'}
        style={{ width: size, height: size }}
      />
    </motion.div>
  )
})
