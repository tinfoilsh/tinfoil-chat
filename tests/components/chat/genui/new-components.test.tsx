import { ArtifactSidebar } from '@/components/chat/artifact-sidebar'
import {
  ArtifactPreview,
  OPEN_ARTIFACT_PREVIEW_EVENT,
  validateArtifactPreviewProps,
} from '@/components/chat/genui/components/ArtifactPreview'
import {
  buildConfirmationActionMessage,
  CONFIRMATION_ACTION_EVENT,
  ConfirmationCard,
  validateConfirmationCardProps,
} from '@/components/chat/genui/components/ConfirmationCard'
import {
  MapPlaceCard,
  validateMapPlaceCardProps,
} from '@/components/chat/genui/components/MapPlaceCard'
import {
  TaskPlan,
  validateTaskPlanProps,
} from '@/components/chat/genui/components/TaskPlan'
import {
  validateWeatherCardProps,
  WeatherCard,
} from '@/components/chat/genui/components/WeatherCard'
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/copy-button', () => ({
  default: () => null,
}))

function renderWithReact(element: React.ReactElement) {
  return render(<React.Fragment>{element}</React.Fragment>)
}

describe('GenUI new components', () => {
  it('opens artifact previews in the sidebar', () => {
    const handleOpen = vi.fn()
    window.addEventListener(
      OPEN_ARTIFACT_PREVIEW_EVENT,
      handleOpen as EventListener,
    )

    expect(
      validateArtifactPreviewProps({
        source: {
          type: 'html',
          html: '<!doctype html><html><body><h1>Demo</h1></body></html>',
        },
      }),
    ).toBe(true)

    const { unmount } = renderWithReact(
      <ArtifactPreview
        title="Status board"
        description="Preview of the generated app"
        source={{
          type: 'html',
          html: '<!doctype html><html><body><h1>Demo</h1></body></html>',
        }}
      />,
    )

    expect(screen.getByText('Status board')).toBeInTheDocument()
    expect(screen.getByText('Preview of the generated app')).toBeInTheDocument()
    expect(
      screen.getByText('Preview opens in the sidebar.'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open preview' }))

    expect(handleOpen).toHaveBeenCalledTimes(1)
    expect(handleOpen.mock.calls[0][0].detail).toMatchObject({
      title: 'Status board',
      description: 'Preview of the generated app',
      source: {
        type: 'html',
        html: expect.stringContaining('Demo'),
      },
    })

    unmount()
    window.removeEventListener(
      OPEN_ARTIFACT_PREVIEW_EVENT,
      handleOpen as EventListener,
    )
  })

  it('renders artifact content inside the sidebar panel', () => {
    renderWithReact(
      <ArtifactSidebar
        isOpen={true}
        onClose={() => {}}
        isDarkMode={true}
        width={640}
        onWidthChange={() => {}}
        isResizable={true}
        artifact={{
          title: 'Status board',
          description: 'Preview of the generated app',
          source: {
            type: 'html',
            html: '<!doctype html><html><body><h1>Demo</h1></body></html>',
          },
        }}
      />,
    )

    expect(screen.getByText('Preview')).toBeInTheDocument()
    expect(screen.getByTitle('Status board')).toHaveAttribute(
      'srcdoc',
      expect.stringContaining('Demo'),
    )
    expect(
      screen.getByRole('separator', { name: 'Resize artifact sidebar' }),
    ).toBeInTheDocument()
  })

  it('resizes the artifact sidebar from the keyboard', () => {
    const handleWidthChange = vi.fn()

    renderWithReact(
      <ArtifactSidebar
        isOpen={true}
        onClose={() => {}}
        isDarkMode={true}
        width={640}
        onWidthChange={handleWidthChange}
        isResizable={true}
        artifact={null}
      />,
    )

    fireEvent.keyDown(
      screen.getByRole('separator', { name: 'Resize artifact sidebar' }),
      { key: 'ArrowLeft' },
    )

    expect(handleWidthChange).toHaveBeenCalledWith(680)
  })

  it('renders a task plan and derives progress from completed tasks', () => {
    expect(
      validateTaskPlanProps({
        tasks: [
          { title: 'Build release', status: 'completed' },
          { title: 'Ship to production', status: 'in_progress' },
        ],
      }),
    ).toBe(true)

    renderWithReact(
      <TaskPlan
        title="Deploy plan"
        tasks={[
          { title: 'Build release', status: 'completed' },
          { title: 'Ship to production', status: 'in_progress' },
        ]}
        nextStep="Verify the rollout"
      />,
    )

    expect(screen.getByText('Deploy plan')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('In progress')).toBeInTheDocument()
    expect(screen.getByText('Verify the rollout')).toBeInTheDocument()
  })

  it('renders a confirmation card with risk details', () => {
    expect(
      validateConfirmationCardProps({
        title: 'Run database migration',
        summary: 'This will apply schema changes to the production database.',
        riskLevel: 'high',
      }),
    ).toBe(true)

    renderWithReact(
      <ConfirmationCard
        title="Run database migration"
        summary="This will apply schema changes to the production database."
        riskLevel="high"
        details={['Requires a maintenance window', 'May restart API workers']}
        consequences={['Writes production data', 'Can affect active sessions']}
      />,
    )

    expect(screen.getByText('Run database migration')).toBeInTheDocument()
    expect(screen.getByText('Action required')).toBeInTheDocument()
    expect(screen.getByText('High risk')).toBeInTheDocument()
    expect(
      screen.getByText('Awaiting confirmation in chat'),
    ).toBeInTheDocument()
    expect(screen.getByText('Writes production data')).toBeInTheDocument()
  })

  it('dispatches a confirmation action when a card button is clicked', () => {
    const handleAction = vi.fn()
    window.addEventListener(
      CONFIRMATION_ACTION_EVENT,
      handleAction as EventListener,
    )

    renderWithReact(
      <ConfirmationCard
        title="Run database migration"
        summary="This will apply schema changes to the production database."
        confirmLabel="Approve Migration"
        cancelLabel="Postpone"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Approve Migration' }))

    expect(handleAction).toHaveBeenCalledTimes(1)
    expect(handleAction.mock.calls[0][0].detail).toEqual({
      action: 'confirm',
      label: 'Approve Migration',
      title: 'Run database migration',
      message: buildConfirmationActionMessage(
        'Run database migration',
        'Approve Migration',
      ),
    })

    window.removeEventListener(
      CONFIRMATION_ACTION_EVENT,
      handleAction as EventListener,
    )
  })

  it('renders a weather card with forecast details', () => {
    expect(
      validateWeatherCardProps({
        location: 'San Francisco',
        condition: 'Partly cloudy',
        temperature: 18,
      }),
    ).toBe(true)

    renderWithReact(
      <WeatherCard
        location="San Francisco"
        condition="Partly cloudy"
        temperature={18}
        unit="C"
        precipitationChance={20}
        forecast={[
          { label: 'Now', temperature: 18, condition: 'Partly cloudy' },
          { label: '3 PM', temperature: 19, precipitationChance: 10 },
        ]}
      />,
    )

    expect(screen.getByText('San Francisco')).toBeInTheDocument()
    expect(screen.getAllByText('Partly cloudy').length).toBeGreaterThan(0)
    expect(screen.getByText('Forecast')).toBeInTheDocument()
    expect(screen.getByText('3 PM')).toBeInTheDocument()
  })

  it('renders a place card with directions and source links', () => {
    expect(
      validateMapPlaceCardProps({
        name: 'Blue Bottle Coffee',
        address: '300 Webster St, Oakland, CA',
      }),
    ).toBe(true)

    renderWithReact(
      <MapPlaceCard
        name="Blue Bottle Coffee"
        address="300 Webster St, Oakland, CA"
        rating={4.6}
        reviewCount={128}
        openNow
        hours={['Mon–Fri: 7 AM – 5 PM', 'Sat–Sun: 8 AM – 5 PM']}
        directionsUrl="https://maps.example.com/blue-bottle"
        sourceUrl="https://example.com/review"
      />,
    )

    expect(screen.getByText('Blue Bottle Coffee')).toBeInTheDocument()
    expect(screen.getByText('300 Webster St, Oakland, CA')).toBeInTheDocument()
    expect(screen.getByText('Open now')).toBeInTheDocument()
    expect(screen.getByText('Directions')).toBeInTheDocument()
    expect(screen.getByText('Source')).toBeInTheDocument()
  })

  it('does not render a task plan without tasks', () => {
    expect(validateTaskPlanProps({ title: 'Invalid plan', tasks: [] })).toBe(
      false,
    )
  })
})
