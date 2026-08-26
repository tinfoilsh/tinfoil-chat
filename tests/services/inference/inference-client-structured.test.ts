import type { BaseModel } from '@/config/models'
import {
  sendStructuredCompletion,
  StructuredCompletionError,
} from '@/services/inference/inference-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { inferenceRequest } = vi.hoisted(() => ({
  inferenceRequest:
    vi.fn<
      (path: string, body: BodyInit, options?: unknown) => Promise<Response>
    >(),
}))

vi.mock('@/services/inference/tinfoil-client', () => ({
  inferenceRequest,
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
): Response {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason: finishReason, message: { content, refusal } }],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

/** The body sent on the one request the call under test made. */
function sentBody(): Record<string, unknown> {
  return JSON.parse(inferenceRequest.mock.calls[0][1] as string)
}

describe('sendStructuredCompletion', () => {
  beforeEach(() => {
    inferenceRequest.mockReset()
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
    inferenceRequest.mockResolvedValueOnce(response('{"value":"ok"}'))

    await sendStructuredCompletion({
      model: candidate,
      autoCandidates: [candidate],
      messages: [{ role: 'user', content: 'repair' }],
      jsonSchema: schema,
      reasoningEffort: 'high',
      thinkingEnabled: true,
    })

    expect(inferenceRequest.mock.calls[0][0]).toBe('/chat/completions')
    const body = sentBody()
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
  })

  it.each([
    [response('{"value":', 'length'), 'incomplete_response'],
    [response(null, 'stop', 'cannot comply'), 'refused_response'],
    [response('', 'stop'), 'empty_response'],
    [response('{not-json}', 'stop'), 'invalid_json_response'],
  ])(
    'classifies malformed structured responses',
    async (apiResponse: ReturnType<typeof response>, code: string) => {
      inferenceRequest.mockResolvedValueOnce(apiResponse)
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
    inferenceRequest.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'service_unavailable', message: 'localized message' },
        }),
        { status: 503 },
      ),
    )

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

  it('preserves abort errors without wrapping', async () => {
    const abortError = new DOMException('cancelled', 'AbortError')
    inferenceRequest.mockRejectedValueOnce(abortError)

    await expect(
      sendStructuredCompletion({
        model: { modelName: 'gpt-oss-120b' } as BaseModel,
        messages: [{ role: 'user', content: 'repair' }],
        jsonSchema: schema,
      }),
    ).rejects.toBe(abortError)
  })
})
