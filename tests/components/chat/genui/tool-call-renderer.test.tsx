import { GenUIToolCallRenderer } from '@/components/chat/genui/GenUIToolCallRenderer'
import { GENUI_WIDGETS_BY_NAME } from '@/components/chat/genui/registry'
import { ArtifactRetryError } from '@/components/chat/genui/retry'
import type { GenUIRenderContext } from '@/components/chat/genui/types'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { logErrorMock } = vi.hoisted(() => ({ logErrorMock: vi.fn() }))

vi.mock('@/utils/error-handling', () => ({ logError: logErrorMock }))

const validMessageCompose = JSON.stringify({
  channel: 'message',
  title: 'Reply draft',
  variants: [{ label: 'Concise', body: 'Thanks, I will confirm.' }],
})

describe('GenUIToolCallRenderer', () => {
  beforeEach(() => {
    logErrorMock.mockReset()
  })

  it('renders completed widget arguments while the assistant stream continues', () => {
    render(
      <GenUIToolCallRenderer
        isStreaming
        toolCalls={[
          {
            id: 'tool-call-1',
            name: 'render_message_compose',
            arguments: validMessageCompose,
          },
        ]}
      />,
    )

    expect(screen.getByText('Reply draft')).toBeInTheDocument()
    expect(
      screen.queryByText(/Generating message compose/),
    ).not.toBeInTheDocument()
  })

  it('shows a simple generating state without raw data or a character count', () => {
    const rawArguments = '{"source":{"type":"html","html":"private-markup"'
    render(
      <GenUIToolCallRenderer
        isStreaming
        toolCalls={[
          {
            id: 'tool-call-1',
            name: 'render_artifact_preview',
            arguments: rawArguments,
          },
        ]}
      />,
    )

    expect(screen.getByText(/Generating artifact preview/)).toBeInTheDocument()
    expect(screen.queryByText(/chars/)).not.toBeInTheDocument()
    expect(screen.queryByText(/private-markup/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /show stream/i }),
    ).not.toBeInTheDocument()
  })

  it('distinguishes invalid JSON, schema validation, and unknown widgets', () => {
    const { rerender } = render(
      <GenUIToolCallRenderer
        isStreaming={false}
        toolCalls={[
          { id: 'one', name: 'render_chart', arguments: '{"type":"bar"' },
        ]}
      />,
    )
    expect(
      screen.getByText('The component data is not valid JSON.'),
    ).toBeInTheDocument()

    rerender(
      <GenUIToolCallRenderer
        isStreaming={false}
        toolCalls={[
          {
            id: 'two',
            name: 'render_chart',
            arguments: '{"type":"invalid","data":[]}',
          },
        ]}
      />,
    )
    expect(screen.getByText(/failed schema validation/)).toBeInTheDocument()

    rerender(
      <GenUIToolCallRenderer
        isStreaming={false}
        toolCalls={[{ id: 'three', name: 'render_unknown', arguments: '{}' }]}
      />,
    )
    expect(screen.getByText('Component unavailable')).toBeInTheDocument()
  })

  it('shows schema-invalid complete JSON while continuation is streaming', () => {
    render(
      <GenUIToolCallRenderer
        isStreaming
        toolCalls={[
          {
            id: 'one',
            name: 'render_chart',
            arguments: '{"type":"invalid","data":[]}',
          },
        ]}
      />,
    )

    expect(screen.getByText(/failed schema validation/)).toBeInTheDocument()
    expect(screen.queryByText(/Generating chart/)).not.toBeInTheDocument()
  })

  it('keeps widget retry repeatable and exposes full regeneration separately', async () => {
    const retryWidget = vi
      .fn()
      .mockRejectedValue(new ArtifactRetryError('incomplete_replacement'))
    const regenerate = vi.fn()
    render(
      <GenUIToolCallRenderer
        isStreaming={false}
        toolCalls={[
          { id: 'one', name: 'render_chart', arguments: '{"type":"bar"' },
        ]}
        onRetryToolCall={retryWidget}
        onRetry={regenerate}
      />,
    )

    const retryButton = screen.getByRole('button', { name: 'Retry widget' })
    expect(
      screen.getByRole('button', { name: 'Regenerate response' }),
    ).toBeInTheDocument()
    fireEvent.click(retryButton)
    await waitFor(() => expect(retryWidget).toHaveBeenCalledTimes(1))
    expect(
      screen.getByText(/replacement was incomplete or invalid JSON/),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry widget' }))
    await waitFor(() => expect(retryWidget).toHaveBeenCalledTimes(2))
    expect(regenerate).not.toHaveBeenCalled()
  })

  it.each([
    ['request_failed', /Could not request a replacement/],
    [
      'schema_invalid_replacement',
      /replacement did not match the component schema/,
    ],
    ['stale_target', /component changed while retrying/],
    ['unavailable_target', /component is no longer available to repair/],
  ] as const)('shows the %s retry category', async (code, description) => {
    render(
      <GenUIToolCallRenderer
        isStreaming={false}
        toolCalls={[
          { id: 'one', name: 'render_chart', arguments: '{"type":"bar"' },
        ]}
        onRetryToolCall={vi
          .fn()
          .mockRejectedValue(new ArtifactRetryError(code))}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry widget' }))
    expect(await screen.findByText(description)).toBeInTheDocument()
  })

  it('retries render exceptions and resets after arguments change', async () => {
    const widget = GENUI_WIDGETS_BY_NAME.render_message_compose
    const originalRender = widget.render
    const retryWidget = vi.fn()
    const regenerate = vi.fn()
    widget.render = (args: { title?: string }, context: GenUIRenderContext) => {
      if (args.title === 'Reply draft') throw new Error('render failed')
      return originalRender?.(args, context) ?? null
    }

    function RenderExceptionHarness() {
      const [argumentsValue, setArgumentsValue] = useState(validMessageCompose)
      return (
        <GenUIToolCallRenderer
          isStreaming={false}
          toolCalls={[
            {
              id: 'tool-call-1',
              name: 'render_message_compose',
              arguments: argumentsValue,
            },
          ]}
          onRetry={regenerate}
          onRetryToolCall={async () => {
            retryWidget()
            if (retryWidget.mock.calls.length === 1) {
              throw new ArtifactRetryError('request_failed')
            }
            setArgumentsValue(
              JSON.stringify({
                channel: 'message',
                title: 'Recovered draft',
                variants: [{ label: 'Concise', body: 'Recovered.' }],
              }),
            )
            return true
          }}
        />
      )
    }

    try {
      render(<RenderExceptionHarness />)
      expect(
        screen.getByText(/component ran into a problem while rendering/),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Regenerate response' }),
      ).toBeInTheDocument()
      expect(logErrorMock).toHaveBeenCalledTimes(1)
      expect(logErrorMock.mock.calls[0][1]).toMatchObject({
        message: 'render_exception',
      })

      fireEvent.click(screen.getByRole('button', { name: 'Retry widget' }))
      expect(
        await screen.findByText(/Could not request a replacement/),
      ).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Retry widget' }))

      expect(await screen.findByText('Recovered draft')).toBeInTheDocument()
      expect(retryWidget).toHaveBeenCalledTimes(2)
      expect(regenerate).not.toHaveBeenCalled()
      expect(logErrorMock).toHaveBeenCalledTimes(1)
      await waitFor(() =>
        expect(
          screen.queryByText(/component ran into a problem while rendering/),
        ).not.toBeInTheDocument(),
      )
    } finally {
      widget.render = originalRender
    }
  })

  it('retries rendering when repaired arguments are unchanged', async () => {
    const widget = GENUI_WIDGETS_BY_NAME.render_message_compose
    const originalRender = widget.render
    let shouldThrow = true
    widget.render = (args: { title?: string }, context: GenUIRenderContext) => {
      if (shouldThrow) throw new Error('render failed')
      return originalRender?.(args, context) ?? null
    }

    try {
      render(
        <GenUIToolCallRenderer
          isStreaming={false}
          toolCalls={[
            {
              id: 'tool-call-1',
              name: 'render_message_compose',
              arguments: validMessageCompose,
            },
          ]}
          onRetryToolCall={async () => {
            shouldThrow = false
            return true
          }}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Retry widget' }))
      expect(await screen.findByText('Reply draft')).toBeInTheDocument()
    } finally {
      widget.render = originalRender
    }
  })
})
