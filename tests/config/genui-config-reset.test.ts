import { getGenUIConfig, setGenUIConfig } from '@/components/chat/genui/config'
import {
  applyGenUIConfigFromResponse,
  getAIModels,
  getCachedAIModels,
  getCachedSystemPromptAndRules,
  getSystemPromptAndRules,
} from '@/config/models'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  setGenUIConfig(null)
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('applyGenUIConfigFromResponse', () => {
  it('applies a valid payload to the runtime config', () => {
    applyGenUIConfigFromResponse({
      header: 'use widgets sparingly',
      enabledWidgets: ['render_stat_cards', 'render_chart'],
    })
    expect(getGenUIConfig()).toEqual({
      header: 'use widgets sparingly',
      enabledWidgets: ['render_stat_cards', 'render_chart'],
    })
  })

  it('clears stale config when the payload is missing entirely', () => {
    setGenUIConfig({ header: 'stale', enabledWidgets: ['render_chart'] })
    applyGenUIConfigFromResponse(undefined)
    expect(getGenUIConfig()).toBeNull()
  })

  it('clears stale config when the payload is malformed', () => {
    setGenUIConfig({ header: 'stale', enabledWidgets: ['render_chart'] })
    applyGenUIConfigFromResponse({ header: 42, enabledWidgets: 'oops' })
    expect(getGenUIConfig()).toBeNull()
  })

  it('drops non-string widget names while keeping valid ones', () => {
    applyGenUIConfigFromResponse({
      header: 'h',
      enabledWidgets: ['render_stat_cards', 7, null, 'render_chart'],
    })
    expect(getGenUIConfig()).toEqual({
      header: 'h',
      enabledWidgets: ['render_stat_cards', 'render_chart'],
    })
  })

  it('clears stale config when the system prompt request falls back', async () => {
    setGenUIConfig({ header: 'stale', enabledWidgets: ['render_chart'] })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const result = await getSystemPromptAndRules()

    expect(result).toEqual({
      systemPrompt: 'You are an intelligent and helpful assistant named Tin.',
      rules: '',
    })
    expect(getGenUIConfig()).toBeNull()
  })

  it('restores cached configuration while the network refreshes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          systemPrompt: 'Cached prompt',
          rules: 'Cached rules',
          genUI: { header: 'cached', enabledWidgets: ['render_chart'] },
        }),
      })
      .mockRejectedValueOnce(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)

    await getSystemPromptAndRules()
    setGenUIConfig(null)

    expect(getCachedSystemPromptAndRules()).toEqual({
      systemPrompt: 'Cached prompt',
      rules: 'Cached rules',
    })
    expect(getGenUIConfig()).toEqual({
      header: 'cached',
      enabledWidgets: ['render_chart'],
    })

    await expect(getSystemPromptAndRules()).resolves.toEqual({
      systemPrompt: 'Cached prompt',
      rules: 'Cached rules',
    })
    expect(getGenUIConfig()).toEqual({
      header: 'cached',
      enabledWidgets: ['render_chart'],
    })
  })

  it('restores a cached model list after a request failure', async () => {
    const model = {
      modelName: 'gpt-oss-120b',
      image: 'openai.png',
      name: 'GPT-OSS 120B',
      nameShort: 'GPT-OSS',
      description: 'Test model',
      type: 'chat',
      chat: true,
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue([model]),
      })
      .mockRejectedValueOnce(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)

    const fetchedModels = await getAIModels()
    expect(fetchedModels).toContainEqual(model)
    expect(getCachedAIModels()).toEqual(fetchedModels)
    await expect(getAIModels()).resolves.toEqual(fetchedModels)
  })
})
