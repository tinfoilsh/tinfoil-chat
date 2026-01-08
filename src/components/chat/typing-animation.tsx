'use client'

import { useEffect, useState } from 'react'

interface TypingAnimationProps {
  fromText: string
  toText: string
  onComplete: () => void
}

/**
 * Animates text changes with a typewriter effect.
 * First deletes the old text character by character, then types the new text.
 */
export function TypingAnimation({
  fromText,
  toText,
  onComplete,
}: TypingAnimationProps) {
  const [currentText, setCurrentText] = useState(fromText)
  const [showCursor, setShowCursor] = useState(true)
  const [phase, setPhase] = useState<'deleting' | 'typing'>('deleting')
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    if (isComplete) return

    const cursorInterval = setInterval(() => {
      setShowCursor((prev) => !prev)
    }, 424)

    return () => clearInterval(cursorInterval)
  }, [isComplete])

  useEffect(() => {
    if (isComplete) return

    let timeoutId: NodeJS.Timeout
    let completionTimeoutId: NodeJS.Timeout

    if (phase === 'deleting') {
      if (currentText.length > 0) {
        timeoutId = setTimeout(
          () => {
            setCurrentText((prev) => prev.slice(0, -1))
          },
          40 + Math.random() * 24,
        )
      } else {
        setPhase('typing')
      }
    } else if (phase === 'typing') {
      if (currentText.length < toText.length) {
        timeoutId = setTimeout(
          () => {
            setCurrentText(toText.slice(0, currentText.length + 1))
          },
          64 + Math.random() * 32,
        )
      } else {
        setIsComplete(true)
        completionTimeoutId = setTimeout(() => {
          onComplete()
        }, 400)
      }
    }

    return () => {
      clearTimeout(timeoutId)
      clearTimeout(completionTimeoutId)
    }
  }, [currentText, phase, toText, onComplete, isComplete])

  return (
    <span className="inline-flex items-baseline">
      <span>{currentText}</span>
      <span
        className={`ml-0.5 inline-block w-0.5 bg-content-primary ${showCursor ? 'opacity-100' : 'opacity-0'}`}
        style={{ height: '1.1em', transform: 'translateY(0.05em)' }}
      />
    </span>
  )
}
