import {
  resolveChatModel,
  useModelManagement,
} from '@/components/chat/hooks/use-model-management'
import type { Chat } from '@/components/chat/types'
import { AUTO_MODEL_ID, type BaseModel } from '@/config/models'
import { SETTINGS_SELECTED_MODEL } from '@/constants/storage-keys'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockModelA: BaseModel = {
  modelName: 'model-a',
  image: 'a.png',
  name: 'Model A',
  nameShort: 'A',
  description: 'First model',
  type: 'chat',
  chat: true,
}

const mockModelB: BaseModel = {
  modelName: 'model-b',
  image: 'b.png',
  name: 'Model B',
  nameShort: 'B',
  description: 'Second model',
  type: 'chat',
  chat: true,
}

const mockModels: BaseModel[] = [mockModelA, mockModelB]

vi.mock('@/utils/error-handling', () => ({
  logWarning: vi.fn(),
  logError: vi.fn(),
}))

describe('resolveChatModel', () => {
  const makeChat = (model?: string): Chat => ({
    id: 'chat-1',
    title: 'Chat',
    messages: [],
    createdAt: new Date(),
    model,
  })

  it("returns the chat's own model when it is available", () => {
    expect(resolveChatModel(makeChat('model-b'), mockModels)).toBe('model-b')
  })

  it('falls back to the saved device model when the chat has no model', () => {
    expect(resolveChatModel(makeChat(undefined), mockModels, 'model-b')).toBe(
      'model-b',
    )
  })

  it("prefers the chat's own model over the saved device model", () => {
    expect(resolveChatModel(makeChat('model-b'), mockModels, 'model-a')).toBe(
      'model-b',
    )
  })

  it('ignores a saved device model that is no longer available', () => {
    expect(
      resolveChatModel(makeChat(undefined), mockModels, 'removed-model'),
    ).toBe(AUTO_MODEL_ID)
  })

  it('falls back to Auto when the chat has no model', () => {
    expect(resolveChatModel(makeChat(undefined), mockModels)).toBe(
      AUTO_MODEL_ID,
    )
  })

  it('falls back to Auto when the chat model is unavailable', () => {
    expect(resolveChatModel(makeChat('removed-model'), mockModels)).toBe(
      AUTO_MODEL_ID,
    )
  })

  it('falls back to Auto when there is no chat', () => {
    expect(resolveChatModel(undefined, mockModels)).toBe(AUTO_MODEL_ID)
  })

  it('returns an empty string when no models are available', () => {
    expect(resolveChatModel(makeChat('model-a'), [])).toBe('')
  })

  it('keeps a chat pinned to a legacy Auto tier id', () => {
    expect(resolveChatModel(makeChat('auto-fast'), mockModels)).toBe(
      'auto-fast',
    )
    expect(resolveChatModel(makeChat('auto-smart'), mockModels)).toBe(
      'auto-smart',
    )
  })

  it('does not offer Auto when only non-chat models exist', () => {
    const embeddingModel: BaseModel = {
      ...mockModelA,
      modelName: 'model-embedding',
      type: 'embedding',
      chat: undefined,
    }
    expect(resolveChatModel(undefined, [embeddingModel])).toBe('')
    expect(resolveChatModel(undefined, [embeddingModel, mockModelB])).toBe(
      AUTO_MODEL_ID,
    )
  })
})

describe('useModelManagement', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  describe('initial model selection', () => {
    it('should start with empty selectedModel before validation', () => {
      const { result } = renderHook(() =>
        useModelManagement({
          models: [],
          isClient: false,
        }),
      )

      expect(result.current.selectedModel).toBe('')
      expect(result.current.hasValidatedModel).toBe(false)
    })

    it('should use saved model from localStorage as initial value', () => {
      localStorage.setItem(SETTINGS_SELECTED_MODEL, 'model-a')

      const { result } = renderHook(() =>
        useModelManagement({
          models: [],
          isClient: false,
        }),
      )

      expect(result.current.selectedModel).toBe('model-a')
    })

    it('should validate and keep saved model when it exists in models list', async () => {
      localStorage.setItem(SETTINGS_SELECTED_MODEL, 'model-b')

      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isClient: true,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      expect(result.current.selectedModel).toBe('model-b')
    })

    it('should fall back to Auto when no saved model exists', async () => {
      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isClient: true,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      expect(result.current.selectedModel).toBe(AUTO_MODEL_ID)
    })
  })

  describe('invalid saved model handling', () => {
    it('should fall back to Auto when saved model does not exist', async () => {
      localStorage.setItem(SETTINGS_SELECTED_MODEL, 'non-existent-model')

      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isClient: true,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      expect(result.current.selectedModel).toBe(AUTO_MODEL_ID)
    })

    it('should fall back to Auto when saved model is empty', async () => {
      localStorage.setItem(SETTINGS_SELECTED_MODEL, '')

      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isClient: true,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      expect(result.current.selectedModel).toBe(AUTO_MODEL_ID)
    })
  })

  describe('hasValidatedModel state', () => {
    it('should be false when not client-side', () => {
      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isClient: false,
        }),
      )

      expect(result.current.hasValidatedModel).toBe(false)
    })

    it('should be false when no models available', () => {
      const { result } = renderHook(() =>
        useModelManagement({
          models: [],
          isClient: true,
        }),
      )

      expect(result.current.hasValidatedModel).toBe(false)
    })

    it('should be true after validation completes', async () => {
      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isClient: true,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })
    })
  })

  describe('handleModelSelect', () => {
    it('should update selectedModel and persist to localStorage', async () => {
      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isClient: true,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      act(() => {
        result.current.handleModelSelect('model-b')
      })

      expect(result.current.selectedModel).toBe('model-b')
      expect(localStorage.getItem(SETTINGS_SELECTED_MODEL)).toBe('model-b')
    })

    it('should reject selection of a model not in the models list', async () => {
      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isClient: true,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      const initialModel = result.current.selectedModel

      act(() => {
        result.current.handleModelSelect('non-existent-model')
      })

      expect(result.current.selectedModel).toBe(initialModel)
    })

    it('closes the menu when a concrete model is picked', async () => {
      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isClient: true,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      act(() => {
        result.current.setExpandedLabel('model')
      })
      act(() => {
        result.current.handleModelSelect('model-b')
      })

      expect(result.current.expandedLabel).toBeNull()
    })

    it('keeps the menu open when Auto is picked so the slider can be adjusted', async () => {
      localStorage.setItem(SETTINGS_SELECTED_MODEL, 'model-a')
      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isClient: true,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })
      expect(result.current.selectedModel).toBe('model-a')

      act(() => {
        result.current.setExpandedLabel('model')
      })
      act(() => {
        result.current.handleModelSelect(AUTO_MODEL_ID)
      })

      expect(result.current.selectedModel).toBe(AUTO_MODEL_ID)
      expect(result.current.expandedLabel).toBe('model')
    })
  })

  describe('localStorage persistence', () => {
    it('should not persist the fallback default when nothing was saved', async () => {
      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isClient: true,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      expect(localStorage.getItem(SETTINGS_SELECTED_MODEL)).toBeNull()
    })

    it('should clear localStorage when the saved model is unavailable', async () => {
      localStorage.setItem(SETTINGS_SELECTED_MODEL, 'removed-model')

      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isClient: true,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      expect(result.current.selectedModel).toBe(AUTO_MODEL_ID)
      expect(localStorage.getItem(SETTINGS_SELECTED_MODEL)).toBeNull()
    })
  })

  describe('Auto selection', () => {
    it('keeps a saved Auto selection', async () => {
      localStorage.setItem(SETTINGS_SELECTED_MODEL, AUTO_MODEL_ID)

      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isClient: true,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      expect(result.current.selectedModel).toBe(AUTO_MODEL_ID)
      expect(localStorage.getItem(SETTINGS_SELECTED_MODEL)).toBe(AUTO_MODEL_ID)
    })

    it('treats a saved legacy Auto tier id as still available', async () => {
      localStorage.setItem(SETTINGS_SELECTED_MODEL, 'auto-fast')

      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isClient: true,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      expect(result.current.selectedModel).toBe('auto-fast')
    })
  })
})
