import { ProjectModeIndicator } from '@/components/project/project-mode-indicator'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('ProjectModeIndicator', () => {
  it('shows the project name using its project color', () => {
    render(<ProjectModeIndicator projectName="Research" color="maya-blue" />)

    const indicator = screen.getByText('Research').closest('div')

    expect(indicator?.textContent).toBe(
      "You're working in the Research project",
    )
    expect(indicator?.style.backgroundColor).toBe('#85C6FF')
    expect(indicator?.classList.contains('md:hidden')).toBe(true)
  })
})
