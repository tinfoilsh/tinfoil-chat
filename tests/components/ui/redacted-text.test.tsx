import { RedactedText } from '@/components/ui/redacted-text'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('RedactedText', () => {
  it('covers active text with an accessible-hidden redaction block', () => {
    render(<RedactedText active={true}>Private title</RedactedText>)

    const source = screen.getByText('Private title')
    const container = source.parentElement
    const block = container?.querySelector('.redacted-text-block')

    expect(container).toHaveClass('redacted-text')
    expect(block).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders only the source text when inactive', () => {
    render(<RedactedText active={false}>Current chat</RedactedText>)

    const source = screen.getByText('Current chat')
    expect(source.parentElement).not.toHaveClass('redacted-text')
    expect(
      source.parentElement?.querySelector('.redacted-text-block'),
    ).toBeNull()
  })
})
