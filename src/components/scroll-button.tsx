'use client'

import { useCallback } from 'react'

interface ScrollButtonProps {
  targetId: string
}

export function ScrollButton({ targetId }: ScrollButtonProps) {
  const handleClick = useCallback(() => {
    const element = document.getElementById(targetId)
    if (element) {
      const offset = 20
      const elementPosition = element.getBoundingClientRect().top
      const offsetPosition = elementPosition + window.scrollY - offset

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      })
    }
  }, [targetId])

  return (
    <button
      onClick={handleClick}
      className="cursor-pointer"
      aria-label="Scroll to features"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-6 w-6 text-white/50 transition-colors hover:text-white/80"
      >
        <path
          fillRule="evenodd"
          d="M12 2.25a.75.75 0 0 1 .75.75v16.19l6.22-6.22a.75.75 0 1 1 1.06 1.06l-7.5 7.5a.75.75 0 0 1-1.06 0l-7.5-7.5a.75.75 0 1 1 1.06-1.06l6.22 6.22V3a.75.75 0 0 1 .75-.75Z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  )
}
