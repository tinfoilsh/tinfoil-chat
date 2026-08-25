import type { BaseModel } from '@/config/models'
import {
  sendStructuredCompletion,
  StructuredCompletionError,
} from '@/services/inference/inference-client'
import { APIUserAbortError } from 'openai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }))

vi.mock('@/services/inference/tinfoil-client', () => ({
  getTinfoilClient: vi.fn(async () => ({
    chat: { completions: { create: createMock } },
  })),
  discardRateLimitSnapshot: vi.fn(),
  getRateLimitInfo: vi.fn(),
  refreshRateLimit: vi.fn(),
  resetTinfoilClient: vi.fn(),
}))

vi.mock('@/utils/error-handling', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}))

const schema = {
  type: 'object',
  properties: { value: { type: 'string' } },
  required: ['value'],
}

function response(
  content: string | null,
  finishReason: string | null = 'stop',
  refusal: string | null = null,
) {
  return {
    choices: [
      {
        finish_reason: finishReason,
        message: { content, refusal },
      },
    ],
  }
}

describe('sendStructuredCompletion', () => {
  beforeEach(() => {
    createMock.mockReset()
  })

  it('preserves Auto candidate params and protects response_format', async () => {
    const candidate = {
      modelName: 'candidate-a',
      requestParams: {
        temperature: 0.25,
        response_format: { type: 'text' },
      },
      reasoningConfig: {
        supportsEffort: true,
        params: {
          '/v1/chat/completions': {
            enable: { reasoning_effort: '$EFFORT' },
          },
        },
      },
    } as BaseModel
    createMock.mockResolvedValueOnce(response('{"value":"ok"}'))

    await sendStructuredCompletion({
      model: candidate,
      autoCandidates: [candidate],
      messages: [{ role: 'user', content: 'repair' }],
      jsonSchema: schema,
      reasoningEffort: 'high',
      thinkingEnabled: true,
    })

    const body = createMock.mock.calls[0][0]
    expect(body.model).toBe('auto')
    expect(body.auto_model_options).toEqual([
      {
        model: 'candidate-a',
        params: { temperature: 0.25, reasoning_effort: 'high' },
      },
    ])
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'response', schema },
    })
    expect(createMock.mock.calls[0][1]).not.toHaveProperty('maxRetries')
  })

  it.each([
    [response('{"value":', 'length'), 'incomplete_response'],
    [response(null, 'stop', 'cannot comply'), 'refused_response'],
    [response('', 'stop'), 'empty_response'],
    [response('{not-json}', 'stop'), 'invalid_json_response'],
  ])(
    'classifies malformed structured responses',
    async (apiResponse: ReturnType<typeof response>, code: string) => {
      createMock.mockResolvedValueOnce(apiResponse)
      await expect(
        sendStructuredCompletion({
          model: { modelName: 'gpt-oss-120b' } as BaseModel,
          messages: [{ role: 'user', content: 'repair' }],
          jsonSchema: schema,
        }),
      ).rejects.toMatchObject({ code })
    },
  )

  it('preserves request status and code without message matching', async () => {
    createMock.mockRejectedValueOnce({
      status: 503,
      code: 'service_unavailable',
      message: 'localized message',
    })

    await expect(
      sendStructuredCompletion({
        model: { modelName: 'gpt-oss-120b' } as BaseModel,
        messages: [{ role: 'user', content: 'repair' }],
        jsonSchema: schema,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<StructuredCompletionError>>({
        code: 'request_failed',
        status: 503,
        requestCode: 'service_unavailable',
      }),
    )
  })

  it.each([
    new APIUserAbortError(),
    new DOMException('cancelled', 'AbortError'),
  ])('preserves abort errors without wrapping', async (abortError) => {
    createMock.mockRejectedValueOnce(abortError)

    await expect(
      sendStructuredCompletion({
        model: { modelName: 'gpt-oss-120b' } as BaseModel,
        messages: [{ role: 'user', content: 'repair' }],
        jsonSchema: schema,
      }),
    ).rejects.toBe(abortError)
  })
})
