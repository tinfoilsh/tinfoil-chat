import { regenerateToolCallArguments } from '@/components/chat/genui/retry'
import type { Message } from '@/components/chat/types'
import type { BaseModel } from '@/config/models'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sendStructuredCompletionMock } = vi.hoisted(() => ({
  sendStructuredCompletionMock: vi.fn(),
}))

vi.mock('@/services/inference/inference-client', () => ({
  sendStructuredCompletion: sendStructuredCompletionMock,
}))

const model = { modelName: 'gpt-oss-120b' } as BaseModel

function userMessage(content: string): Message {
  return { role: 'user', content, timestamp: new Date() }
}

describe('regenerateToolCallArguments', () => {
  beforeEach(() => {
    sendStructuredCompletionMock.mockReset()
  })

  it('returns validated arguments serialized for the tool-call block', async () => {
    const regenerated = {
      type: 'bar',
      data: [{ label: 'A', value: 10 }],
      title: 'Sales',
    }
    sendStructuredCompletionMock.mockResolvedValueOnce(regenerated)

    const result = await regenerateToolCallArguments({
      toolName: 'render_chart',
      contextMessages: [userMessage('Chart my sales data')],
      model,
    })

    expect(result).not.toBeNull()
    expect(JSON.parse(result as string)).toMatchObject(regenerated)
    // The re-ask must be constrained by the widget's JSON schema.
    const call = sendStructuredCompletionMock.mock.calls[0][0]
    expect(call.jsonSchema).toBeTruthy()
    expect(call.model).toBe(model)
  })

  it('returns null when regenerated arguments still fail validation', async () => {
    sendStructuredCompletionMock.mockResolvedValueOnce({
      type: 'donut', // not a valid chart type
      data: [],
    })

    const result = await regenerateToolCallArguments({
      toolName: 'render_chart',
      contextMessages: [userMessage('Chart my sales data')],
      model,
    })

    expect(result).toBeNull()
  })

  it('returns null for unknown widgets without calling the model', async () => {
    const result = await regenerateToolCallArguments({
      toolName: 'render_nonexistent',
      contextMessages: [userMessage('Hello')],
      model,
    })

    expect(result).toBeNull()
    expect(sendStructuredCompletionMock).not.toHaveBeenCalled()
  })

  it('returns null when the structured completion fails', async () => {
    sendStructuredCompletionMock.mockRejectedValueOnce(
      new Error('network down'),
    )

    const result = await regenerateToolCallArguments({
      toolName: 'render_chart',
      contextMessages: [userMessage('Chart my sales data')],
      model,
    })

    expect(result).toBeNull()
  })
})
