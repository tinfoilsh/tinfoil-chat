import { useCallback, useEffect, useRef, useState } from 'react'

interface UseUIStateReturn {
  isClient: boolean
  isSidebarOpen: boolean
  isDarkMode: boolean
  windowWidth: number
  messagesEndRef: React.RefObject<HTMLDivElement>
  setIsSidebarOpen: (isOpen: boolean) => void
  toggleTheme: () => void
  openAndExpandVerifier: () => void
  handleInputFocus: () => void
}

export function useUIState(): UseUIStateReturn {
  const [isClient, setIsClient] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 0,
  )

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Client-side initialization
  useEffect(() => {
    setIsClient(true)

    // Check localStorage first
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme !== null) {
      setIsDarkMode(savedTheme === 'dark')
      return
    }

    // Default to light mode when no saved preference
    setIsDarkMode(false)

    // Note: Not using browser's color scheme preference anymore
    // to ensure consistent light mode default for new users
  }, [])

  // Add effect to handle window resizing
  useEffect(() => {
    if (isClient) {
      const handleResize = () => {
        setWindowWidth(window.innerWidth)
      }

      window.addEventListener('resize', handleResize)
      return () => {
        window.removeEventListener('resize', handleResize)
      }
    }
  }, [isClient])

  // Add effect to prevent body and html scrolling
  useEffect(() => {
    if (isClient) {
      // Prevent scrolling on both body and html elements
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
      document.body.style.height = '100%'
      document.body.style.overflow = 'hidden'
      document.body.style.overscrollBehavior = 'none'

      // Also apply to the HTML element
      document.documentElement.style.overscrollBehavior = 'none'
      document.documentElement.style.overflow = 'hidden'
      document.documentElement.style.height = '100%'

      return () => {
        // Cleanup
        document.body.style.position = ''
        document.body.style.width = ''
        document.body.style.height = ''
        document.body.style.overflow = ''
        document.body.style.overscrollBehavior = ''

        document.documentElement.style.overscrollBehavior = ''
        document.documentElement.style.overflow = ''
        document.documentElement.style.height = ''
      }
    }
  }, [isClient])

  // Toggle dark mode
  const toggleTheme = useCallback(() => {
    setIsDarkMode((prev) => {
      const newTheme = !prev
      localStorage.setItem('theme', newTheme ? 'dark' : 'light')
      // Trigger theme change event for profile sync
      window.dispatchEvent(
        new CustomEvent('themeChanged', {
          detail: newTheme ? 'dark' : 'light',
        }),
      )
      return newTheme
    })
  }, [])

  // Handle verifier expansion
  const openAndExpandVerifier = useCallback(() => {
    // Always ensure the sidebar is open
    setIsSidebarOpen(true)

    // Add a delay to ensure sidebar is opened before expanding verifier
    setTimeout(() => {
      const event = new CustomEvent('expand-verifier')
      window.dispatchEvent(event)
    }, 300)
  }, [])

  // Handle input focus
  const handleInputFocus = useCallback(() => {
    // Only close sidebar on narrow screens (mobile devices)
    if (isSidebarOpen && windowWidth < 768) {
      setIsSidebarOpen(false)
    }
  }, [isSidebarOpen, windowWidth])

  return {
    isClient,
    isSidebarOpen,
    isDarkMode,
    windowWidth,
    messagesEndRef,
    setIsSidebarOpen,
    toggleTheme,
    openAndExpandVerifier,
    handleInputFocus,
  }
}
