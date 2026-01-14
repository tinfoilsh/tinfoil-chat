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

  const size = 16
  const strokeColor = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'

  const svgPattern = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <path d="M ${size} 0 L 0 0 0 ${size}" fill="none" stroke="${strokeColor}" stroke-width="1" />
  </svg>`
  const encodedSvg = `data:image/svg+xml,${encodeURIComponent(svgPattern)}`

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-0 ${className}`}
      style={{
        backgroundImage: `url("${encodedSvg}")`,
        backgroundRepeat: 'repeat',
      }}
    />
  )
}
