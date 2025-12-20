'use client'

import { useEffect, useState } from 'react'

export function TextureGrid({ className = '' }: { className?: string }) {
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    const checkDarkMode = () => {
      const theme = localStorage.getItem('theme')
      if (theme) {
        setIsDarkMode(theme === 'dark')
      } else {
        setIsDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches)
      }
    }

    checkDarkMode()

    const handleStorageChange = () => checkDarkMode()
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('themeChanged', handleStorageChange)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('themeChanged', handleStorageChange)
    }
  }, [])

  const columnWidth = 2
  const cellHeight = 2
  const columnGap = 5

  const generatePattern = () => {
    const rects: string[] = []

    for (let col = 0; col < 30; col++) {
      const x = col * columnGap

      for (let row = 0; row < 40; row++) {
        const y = row * cellHeight
        const opacity = row % 2 === 0 ? 0.067 : 0

        if (opacity > 0) {
          rects.push(
            `<rect x="${x}" y="${y}" width="${columnWidth}" height="${cellHeight}" fill="rgba(156, 163, 175, ${opacity})" />`,
          )
        }
      }
    }

    return rects.join('')
  }

  const svgPattern = `<svg xmlns="http://www.w3.org/2000/svg" width="${30 * columnGap}" height="${40 * cellHeight}">${generatePattern()}</svg>`
  const encodedSvg = `data:image/svg+xml,${encodeURIComponent(svgPattern)}`

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-0 ${className}`}
      style={{
        backgroundImage: `url("${encodedSvg}")`,
        backgroundRepeat: 'repeat',
        opacity: isDarkMode ? 0.5 : 1,
      }}
    />
  )
}
