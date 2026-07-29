import { Button } from '@/components/ui/button'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('Button', () => {
  it('does not submit a form unless explicitly configured to submit', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())

    render(
      <form onSubmit={onSubmit}>
        <Button>Open settings</Button>
      </form>,
    )

    const button = screen.getByRole('button', { name: 'Open settings' })
    expect(button).toHaveAttribute('type', 'button')
    fireEvent.click(button)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
