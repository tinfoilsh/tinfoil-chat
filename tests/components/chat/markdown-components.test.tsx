import { createMarkdownComponents } from '@/components/chat/renderers/components/markdown-components'
import { TooltipProvider } from '@/components/ui/tooltip'
import { render, screen } from '@testing-library/react'
import { createElement, type ElementType } from 'react'
import { describe, expect, it } from 'vitest'

describe('createMarkdownComponents citations', () => {
  const citationUrlTitles = new Map([['https://a.test', 'Example']])

  it('renders citation links as pills while streaming', () => {
    const components = createMarkdownComponents({
      isDarkMode: false,
      isStreaming: true,
      showMarkdownTablePlaceholder: false,
      citationUrlTitles,
    })

    render(
      createElement(
        TooltipProvider,
        null,
        createElement(
          components.a as ElementType,
          { href: 'https://a.test' },
          'source',
        ),
      ),
    )

    expect(screen.getByRole('link')).toHaveTextContent('a')
    expect(screen.getByRole('link')).toHaveClass('align-middle', 'leading-none')
  })

  it('renders citation links as pills after streaming finishes', () => {
    const components = createMarkdownComponents({
      isDarkMode: false,
      isStreaming: false,
      showMarkdownTablePlaceholder: false,
      citationUrlTitles,
    })

    render(
      createElement(
        TooltipProvider,
        null,
        createElement(
          components.a as ElementType,
          { href: 'https://a.test' },
          'source',
        ),
      ),
    )

    expect(screen.getByRole('link')).toHaveTextContent('a')
    expect(screen.getByRole('link')).toHaveClass('align-middle', 'leading-none')
  })
})
