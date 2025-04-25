import { motion } from 'framer-motion'

export function LoadingDots({
  isThinking = false,
  isDarkMode = false,
}: {
  isThinking?: boolean
  isDarkMode?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5 px-1">
      {[0, 0.2, 0.4].map((delay, i) => (
        <motion.div
          key={i}
          className={`h-1 w-1 rounded-full ${
            isThinking
              ? 'bg-current'
              : isDarkMode
                ? 'bg-gray-300'
                : 'bg-gray-800'
          }`}
          animate={{ scale: [0.5, 1, 0.5], opacity: [0.25, 1, 0.25] }}
          transition={{
            duration: 1,
            delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}
