import { useModelManagement } from '@/components/chat/hooks/use-model-management'
import type { BaseModel } from '@/config/models'
import { SETTINGS_SELECTED_MODEL } from '@/constants/storage-keys'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFreeModel: BaseModel = {
  modelName: 'gpt-oss-120b',
  displayName: 'GPT-OSS 120B',
  paid: false,
}

const mockPremiumModel: BaseModel = {
  modelName: 'claude-sonnet-4',
  displayName: 'Claude Sonnet 4',
  paid: true,
}

const mockModels: BaseModel[] = [mockFreeModel, mockPremiumModel]

vi.mock('@/config/models', async () => {
  const actual = await vi.importActual('@/config/models')
  return {
    ...actual,
    isModelNameAvailable: (
      modelName: string,
      models: BaseModel[],
      isPremium: boolean,
    ) => {
      const model = models.find((m) => m.modelName === modelName)
      if (!model) return false
      if (model.paid && !isPremium) return false
      return true
    },
  }
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
          isPremium: false,
          isClient: false,
          storeHistory: true,
          subscriptionLoading: true,
        }),
      )

      expect(result.current.selectedModel).toBe('')
      expect(result.current.hasValidatedModel).toBe(false)
    })

    it('should use saved model from localStorage if available', () => {
      localStorage.setItem(SETTINGS_SELECTED_MODEL, 'gpt-oss-120b')

      const { result } = renderHook(() =>
        useModelManagement({
          models: [],
          isPremium: false,
          isClient: false,
          storeHistory: true,
          subscriptionLoading: true,
        }),
      )

      expect(result.current.selectedModel).toBe('gpt-oss-120b')
    })

    it('should validate and select first available model when models load', async () => {
      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isPremium: false,
          isClient: true,
          storeHistory: true,
          subscriptionLoading: false,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      expect(result.current.selectedModel).toBe('gpt-oss-120b')
    })
  })

  describe('free user model validation', () => {
    it('should select free model for non-premium users', async () => {
      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isPremium: false,
          isClient: true,
          storeHistory: true,
          subscriptionLoading: false,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      expect(result.current.selectedModel).toBe('gpt-oss-120b')
    })

    it('should switch from premium to free model for non-premium users', async () => {
      localStorage.setItem(SETTINGS_SELECTED_MODEL, 'claude-sonnet-4')

      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isPremium: false,
          isClient: true,
          storeHistory: true,
          subscriptionLoading: false,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      expect(result.current.selectedModel).toBe('gpt-oss-120b')
    })

    it('should keep valid free model for non-premium users', async () => {
      localStorage.setItem(SETTINGS_SELECTED_MODEL, 'gpt-oss-120b')

      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isPremium: false,
          isClient: true,
          storeHistory: true,
          subscriptionLoading: false,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      expect(result.current.selectedModel).toBe('gpt-oss-120b')
    })
  })

  describe('premium user model validation', () => {
    it('should select premium model for premium users', async () => {
      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isPremium: true,
          isClient: true,
          storeHistory: true,
          subscriptionLoading: false,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      expect(result.current.selectedModel).toBe('claude-sonnet-4')
    })

    it('should upgrade from free to premium model for premium users', async () => {
      localStorage.setItem(SETTINGS_SELECTED_MODEL, 'gpt-oss-120b')

      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isPremium: true,
          isClient: true,
          storeHistory: true,
          subscriptionLoading: false,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      expect(result.current.selectedModel).toBe('claude-sonnet-4')
    })
  })

  describe('hasValidatedModel state', () => {
    it('should be false when subscription is loading', () => {
      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isPremium: false,
          isClient: true,
          storeHistory: true,
          subscriptionLoading: true,
        }),
      )

      expect(result.current.hasValidatedModel).toBe(false)
    })

    it('should be false when not client-side', () => {
      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isPremium: false,
          isClient: false,
          storeHistory: true,
          subscriptionLoading: false,
        }),
      )

      expect(result.current.hasValidatedModel).toBe(false)
    })

    it('should be false when no models available', () => {
      const { result } = renderHook(() =>
        useModelManagement({
          models: [],
          isPremium: false,
          isClient: true,
          storeHistory: true,
          subscriptionLoading: false,
        }),
      )

      expect(result.current.hasValidatedModel).toBe(false)
    })

    it('should be true after validation completes', async () => {
      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isPremium: false,
          isClient: true,
          storeHistory: true,
          subscriptionLoading: false,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })
    })
  })

  describe('invalid saved model handling', () => {
    it('should handle non-existent saved model', async () => {
      localStorage.setItem(SETTINGS_SELECTED_MODEL, 'non-existent-model')

      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isPremium: false,
          isClient: true,
          storeHistory: true,
          subscriptionLoading: false,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      expect(result.current.selectedModel).toBe('gpt-oss-120b')
    })

    it('should handle empty saved model', async () => {
      localStorage.setItem(SETTINGS_SELECTED_MODEL, '')

      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isPremium: false,
          isClient: true,
          storeHistory: true,
          subscriptionLoading: false,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      expect(result.current.selectedModel).toBe('gpt-oss-120b')
    })
  })

  describe('handleModelSelect', () => {
    it('should update selectedModel when valid model selected', async () => {
      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isPremium: true,
          isClient: true,
          storeHistory: true,
          subscriptionLoading: false,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      act(() => {
        result.current.handleModelSelect('gpt-oss-120b')
      })

      expect(result.current.selectedModel).toBe('gpt-oss-120b')
      expect(localStorage.getItem(SETTINGS_SELECTED_MODEL)).toBe('gpt-oss-120b')
    })

    it('should not allow premium model selection for free users', async () => {
      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isPremium: false,
          isClient: true,
          storeHistory: true,
          subscriptionLoading: false,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      const initialModel = result.current.selectedModel

      act(() => {
        result.current.handleModelSelect('claude-sonnet-4')
      })

      expect(result.current.selectedModel).toBe(initialModel)
    })
  })

  describe('localStorage persistence', () => {
    it('should save validated model to localStorage', async () => {
      const { result } = renderHook(() =>
        useModelManagement({
          models: mockModels,
          isPremium: false,
          isClient: true,
          storeHistory: true,
          subscriptionLoading: false,
        }),
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      expect(localStorage.getItem(SETTINGS_SELECTED_MODEL)).toBe('gpt-oss-120b')
    })

    it('should update localStorage when model changes', async () => {
      const { result, rerender } = renderHook(
        ({ isPremium }) =>
          useModelManagement({
            models: mockModels,
            isPremium,
            isClient: true,
            storeHistory: true,
            subscriptionLoading: false,
          }),
        { initialProps: { isPremium: false } },
      )

      await waitFor(() => {
        expect(result.current.hasValidatedModel).toBe(true)
      })

      expect(localStorage.getItem(SETTINGS_SELECTED_MODEL)).toBe('gpt-oss-120b')

      rerender({ isPremium: true })

      await waitFor(() => {
        expect(result.current.selectedModel).toBe('claude-sonnet-4')
      })

      expect(localStorage.getItem(SETTINGS_SELECTED_MODEL)).toBe(
        'claude-sonnet-4',
      )
    })
  })
})
