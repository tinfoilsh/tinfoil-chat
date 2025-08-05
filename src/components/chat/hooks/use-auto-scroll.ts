import { useEffect, useRef, useState } from 'react'

interface UseAutoScrollOptions {
  threshold?: number
  enabled?: boolean
}

export function useAutoScroll(
  messagesEndRef: React.RefObject<HTMLDivElement>,
  options: UseAutoScrollOptions = {},
) {
  const { threshold = 150, enabled = true } = options
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const userScrollingRef = useRef(false)
  const wasAtBottomRef = useRef(true)

  useEffect(() => {
    if (!enabled) return

    // Find the parent scroll container
    const findScrollParent = (
      element: HTMLElement | null,
    ): HTMLElement | null => {
      if (!element) return null
      const parent = element.parentElement
      if (!parent) return null

      const overflow = window.getComputedStyle(parent).overflowY
      if (overflow === 'auto' || overflow === 'scroll') {
        return parent
      }
      return findScrollParent(parent)
    }

    const messageContainer = messagesEndRef.current?.parentElement
    const scrollContainer = findScrollParent(messageContainer ?? null)

    if (!scrollContainer) return

    let scrollTimeout: NodeJS.Timeout
    let lastScrollTop = scrollContainer.scrollTop

    const checkIfAtBottom = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight

      // Multiple ways to check if at bottom to handle edge cases
      const checks = {
        nearBottom: distanceFromBottom < threshold,
        atBottom: distanceFromBottom <= 2,
        scrolledToMax: scrollTop >= scrollHeight - clientHeight - 1,
        roundingCheck:
          Math.round(scrollTop + clientHeight) >= Math.round(scrollHeight),
      }

      return (
        checks.nearBottom ||
        checks.atBottom ||
        checks.scrolledToMax ||
        checks.roundingCheck
      )
    }

    const handleScroll = () => {
      const { scrollTop } = scrollContainer
      const isScrollingUp = scrollTop < lastScrollTop - 5
      const atBottom = checkIfAtBottom()

      // Track if we're at bottom for content change detection
      wasAtBottomRef.current = atBottom

      // Always check if we're at bottom
      if (atBottom) {
        setShouldAutoScroll(true)
        userScrollingRef.current = false
      } else if (isScrollingUp) {
        setShouldAutoScroll(false)
        userScrollingRef.current = true
      }

      lastScrollTop = scrollTop

      // Clear existing timeout
      clearTimeout(scrollTimeout)

      // When scrolling stops, do a final check
      scrollTimeout = setTimeout(() => {
        const stillAtBottom = checkIfAtBottom()
        wasAtBottomRef.current = stillAtBottom
        if (stillAtBottom) {
          setShouldAutoScroll(true)
          userScrollingRef.current = false
        }
      }, 50) // Very fast check
    }

    const handleUserInteraction = () => {
      if (!checkIfAtBottom()) {
        userScrollingRef.current = true
        setShouldAutoScroll(false)
      }
    }

    // Add a scroll end listener for browsers that support it
    const handleScrollEnd = () => {
      if (checkIfAtBottom()) {
        setShouldAutoScroll(true)
        userScrollingRef.current = false
      }
    }

    // Also use IntersectionObserver as a backup
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShouldAutoScroll(true)
            userScrollingRef.current = false
          }
        })
      },
      { threshold: 0.1 },
    )

    if (messagesEndRef.current) {
      observer.observe(messagesEndRef.current)
    }

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
    scrollContainer.addEventListener('scrollend', handleScrollEnd, {
      passive: true,
    })
    scrollContainer.addEventListener('wheel', handleUserInteraction, {
      passive: true,
    })
    scrollContainer.addEventListener('touchmove', handleUserInteraction, {
      passive: true,
    })

    // Initial check
    handleScroll()

    // Use ResizeObserver to detect content height changes
    const resizeObserver = new ResizeObserver(() => {
      // If we were at the bottom before resize and autoscroll is enabled
      if (wasAtBottomRef.current && shouldAutoScroll) {
        // Scroll to new bottom
        requestAnimationFrame(() => {
          scrollContainer.scrollTop =
            scrollContainer.scrollHeight - scrollContainer.clientHeight
          wasAtBottomRef.current = true
          setShouldAutoScroll(true)
        })
      }
    })

    // Observe the messages container
    const messagesContainer = scrollContainer.querySelector('[class*="pb-6"]')
    if (messagesContainer) {
      resizeObserver.observe(messagesContainer)
    }

    return () => {
      clearTimeout(scrollTimeout)
      scrollContainer.removeEventListener('scroll', handleScroll)
      scrollContainer.removeEventListener('scrollend', handleScrollEnd)
      scrollContainer.removeEventListener('wheel', handleUserInteraction)
      scrollContainer.removeEventListener('touchmove', handleUserInteraction)
      observer.disconnect()
      resizeObserver.disconnect()
    }
  }, [messagesEndRef, shouldAutoScroll, threshold, enabled])

  return {
    shouldAutoScroll,
    userScrollingRef,
  }
}
