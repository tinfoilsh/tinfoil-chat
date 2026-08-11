import { ThoughtProcess } from '@/components/chat/renderers/components/ThoughtProcess'
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { summarizeMock } = vi.hoisted(() => ({
  summarizeMock: vi.fn(),
}))

vi.mock('@/services/inference/summary-client', () => ({
  summarize: summarizeMock,
}))

vi.mock('@/components/chat/renderers/components/use-math-plugins', () => ({
  useMathPlugins: () => ({ remarkPlugins: [], rehypePlugins: [] }),
}))

const FIRST_THOUGHTS = Array.from(
  { length: 20 },
  (_, index) => `first${index}`,
).join(' ')
const LATEST_THOUGHTS = `${FIRST_THOUGHTS} latest`

describe('ThoughtProcess summaries', () => {
  afterEach(() => {
    vi.useRealTimers()
    summarizeMock.mockReset()
  })

  it('retains the last successful summary when the latest request fails', async () => {
    vi.useFakeTimers()
    summarizeMock
      .mockResolvedValueOnce('Useful summary')
      .mockRejectedValueOnce(new Error('temporarily unavailable'))
    const view = render(
      <ThoughtProcess
        thoughts={FIRST_THOUGHTS}
        isDarkMode={false}
        isThinking
      />,
    )

    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    expect(screen.getByText('Useful summary')).toBeInTheDocument()

    view.rerender(
      <ThoughtProcess
        thoughts={LATEST_THOUGHTS}
        isDarkMode={false}
        isThinking
      />,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    expect(screen.getByText('Useful summary')).toBeInTheDocument()
  })

  it('queues the latest thoughts without restarting in-flight work', async () => {
    vi.useFakeTimers()
    let resolveFirst!: (summary: string) => void
    let resolveLatest!: (summary: string) => void
    summarizeMock
      .mockImplementationOnce(
        () => new Promise<string>((resolve) => (resolveFirst = resolve)),
      )
      .mockImplementationOnce(
        () => new Promise<string>((resolve) => (resolveLatest = resolve)),
      )
    const view = render(
      <ThoughtProcess
        thoughts={FIRST_THOUGHTS}
        isDarkMode={false}
        isThinking
      />,
    )
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    const firstSignal = summarizeMock.mock.calls[0][0].signal as AbortSignal

    view.rerender(
      <ThoughtProcess
        thoughts={LATEST_THOUGHTS}
        isDarkMode={false}
        isThinking
      />,
    )
    expect(firstSignal.aborted).toBe(false)
    await act(async () => {
      resolveFirst('Stale summary')
      await Promise.resolve()
    })
    expect(screen.queryByText('Stale summary')).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(summarizeMock).toHaveBeenCalledTimes(2)
    await act(async () => {
      resolveLatest('Latest summary')
      await Promise.resolve()
    })
    expect(screen.getByText('Latest summary')).toBeInTheDocument()
  })
})
