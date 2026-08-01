'use client'

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from './utils'

const PIXEL_SIZE_CSS_PX = 2.5
const MIN_CANVAS_DIMENSION = 1
const TEXT_ELLIPSIS = '...'
const HOVER_CAPABLE_POINTER_QUERY = '(hover: hover) and (pointer: fine)'

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect

function fitTextToWidth(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (context.measureText(text).width <= maxWidth) return text

  const characters = Array.from(text)
  let lowerBound = 0
  let upperBound = characters.length

  while (lowerBound < upperBound) {
    const midpoint = Math.ceil((lowerBound + upperBound) / 2)
    const candidate = `${characters.slice(0, midpoint).join('')}${TEXT_ELLIPSIS}`

    if (context.measureText(candidate).width <= maxWidth) {
      lowerBound = midpoint
    } else {
      upperBound = midpoint - 1
    }
  }

  return `${characters.slice(0, lowerBound).join('')}${TEXT_ELLIPSIS}`
}

function getCenteredTextBaseline(
  metrics: TextMetrics,
  canvasHeight: number,
): number {
  const ascent =
    metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent
  const descent =
    metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent

  if (!Number.isFinite(ascent) || !Number.isFinite(descent)) {
    return canvasHeight / 2
  }

  return (canvasHeight + ascent - descent) / 2
}

interface PixelatedTextProps {
  text: string
  active: boolean
  children: ReactNode
  className?: string
  renderKey?: string | boolean
}

export function PixelatedText({
  text,
  active,
  children,
  className,
  renderKey,
}: PixelatedTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const sourceRef = useRef<HTMLSpanElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isCanvasReady, setIsCanvasReady] = useState(false)

  useIsomorphicLayoutEffect(() => {
    setIsCanvasReady(false)
    if (!active) return

    const container = containerRef.current
    const source = sourceRef.current
    const canvas = canvasRef.current
    if (!container || !source || !canvas) return

    let cancelled = false
    let resizeObserver: ResizeObserver | null = null
    const pointerQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia(HOVER_CAPABLE_POINTER_QUERY)
        : null

    const drawPixelatedText = () => {
      if (cancelled) return

      const bounds = container.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) return

      canvas.width = Math.max(
        MIN_CANVAS_DIMENSION,
        Math.ceil(bounds.width / PIXEL_SIZE_CSS_PX),
      )
      canvas.height = Math.max(
        MIN_CANVAS_DIMENSION,
        Math.ceil(bounds.height / PIXEL_SIZE_CSS_PX),
      )

      const context = canvas.getContext('2d')
      if (!context) return

      const styles = window.getComputedStyle(source)
      const fontSize = Number.parseFloat(styles.fontSize)
      if (!Number.isFinite(fontSize)) return

      context.clearRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = styles.color
      context.font = [
        styles.fontStyle,
        styles.fontVariant,
        styles.fontWeight,
        `${fontSize / PIXEL_SIZE_CSS_PX}px`,
        styles.fontFamily,
      ].join(' ')
      context.imageSmoothingEnabled = false
      context.textBaseline = 'alphabetic'

      const fittedText = fitTextToWidth(context, text, canvas.width)
      const baseline = getCenteredTextBaseline(
        context.measureText(fittedText),
        canvas.height,
      )
      context.fillText(fittedText, 0, baseline)
      setIsCanvasReady(true)
    }

    const stopRendering = () => {
      resizeObserver?.disconnect()
      resizeObserver = null
      setIsCanvasReady(false)
    }

    const startRendering = () => {
      if (cancelled) return
      if (pointerQuery && !pointerQuery.matches) return

      drawPixelatedText()
      if (typeof ResizeObserver !== 'undefined' && !resizeObserver) {
        resizeObserver = new ResizeObserver(drawPixelatedText)
        resizeObserver.observe(container)
      }
    }

    const handlePointerCapabilityChange = () => {
      stopRendering()
      startRendering()
    }

    pointerQuery?.addEventListener('change', handlePointerCapabilityChange)
    startRendering()

    void document.fonts?.ready.then(startRendering)

    return () => {
      cancelled = true
      pointerQuery?.removeEventListener('change', handlePointerCapabilityChange)
      resizeObserver?.disconnect()
    }
  }, [active, renderKey, text])

  return (
    <span
      ref={containerRef}
      data-pixelation-ready={isCanvasReady ? 'true' : undefined}
      className={cn(
        'relative block min-w-0',
        active && 'pixelated-text',
        className,
      )}
    >
      <span ref={sourceRef} className="pixelated-text-source">
        {children}
      </span>
      {active && (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="pixelated-text-canvas pointer-events-none absolute inset-0 h-full w-full"
        />
      )}
    </span>
  )
}
