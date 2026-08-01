import { PixelatedText } from '@/components/ui/pixelated-text'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const CANVAS_TEXT_WIDTH_PER_CHARACTER = 4
const SOURCE_WIDTH = 100
const SOURCE_HEIGHT = 20
const EXPECTED_CANVAS_WIDTH = 40
const EXPECTED_CANVAS_HEIGHT = 8
const FONT_ASCENT = 4
const FONT_DESCENT = 1
const EXPECTED_TEXT_BASELINE =
  (EXPECTED_CANVAS_HEIGHT + FONT_ASCENT - FONT_DESCENT) / 2

describe('PixelatedText', () => {
  const fillText = vi.fn()
  const context = {
    clearRect: vi.fn(),
    fillStyle: '',
    fillText,
    font: '',
    imageSmoothingEnabled: true,
    measureText: vi.fn((text: string) => ({
      fontBoundingBoxAscent: FONT_ASCENT,
      fontBoundingBoxDescent: FONT_DESCENT,
      width: text.length * CANVAS_TEXT_WIDTH_PER_CHARACTER,
    })),
    textBaseline: 'alphabetic',
  } as unknown as CanvasRenderingContext2D

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: SOURCE_HEIGHT,
      height: SOURCE_HEIGHT,
      left: 0,
      right: SOURCE_WIDTH,
      top: 0,
      width: SOURCE_WIDTH,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      color: 'rgb(17, 24, 39)',
      fontFamily: 'Aeonik Fono',
      fontSize: '14px',
      fontStyle: 'normal',
      fontVariant: 'normal',
      fontWeight: '500',
    } as CSSStyleDeclaration)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    fillText.mockClear()
  })

  it('draws text onto a low-resolution canvas', () => {
    render(
      <PixelatedText text="Private title" active={true}>
        Private title
      </PixelatedText>,
    )

    const source = screen.getByText('Private title')
    const container = source.parentElement
    const canvas = container?.querySelector('canvas')

    expect(container).toHaveAttribute('data-pixelation-ready', 'true')
    expect(canvas).toHaveAttribute('aria-hidden', 'true')
    expect(canvas).toHaveProperty('width', EXPECTED_CANVAS_WIDTH)
    expect(canvas).toHaveProperty('height', EXPECTED_CANVAS_HEIGHT)
    expect(fillText).toHaveBeenCalledWith(
      'Private...',
      0,
      EXPECTED_TEXT_BASELINE,
    )
  })

  it('renders only accessible source text when inactive', () => {
    render(
      <PixelatedText text="Current chat" active={false}>
        Current chat
      </PixelatedText>,
    )

    const source = screen.getByText('Current chat')
    expect(source.parentElement).not.toHaveAttribute('data-pixelation-ready')
    expect(source.parentElement?.querySelector('canvas')).toBeNull()
  })

  it('renders when a touch-only device gains a hover-capable pointer', () => {
    let handleChange: (() => void) | undefined
    const pointerQuery = {
      matches: false,
      addEventListener: vi.fn(
        (_event: string, listener: EventListenerOrEventListenerObject) => {
          handleChange = listener as () => void
        },
      ),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => pointerQuery),
    )

    render(
      <PixelatedText text="Touch title" active={true}>
        Touch title
      </PixelatedText>,
    )

    expect(screen.getByText('Touch title').parentElement).not.toHaveAttribute(
      'data-pixelation-ready',
    )
    expect(fillText).not.toHaveBeenCalled()

    pointerQuery.matches = true
    act(() => handleChange?.())

    expect(screen.getByText('Touch title').parentElement).toHaveAttribute(
      'data-pixelation-ready',
      'true',
    )
    expect(fillText).toHaveBeenCalled()
  })
})
