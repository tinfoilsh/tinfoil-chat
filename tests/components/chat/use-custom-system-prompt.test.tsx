import { useCustomSystemPrompt } from '@/components/chat/hooks/use-custom-system-prompt'
import {
  USER_PREFS_NICKNAME,
  USER_PREFS_PERSONALIZATION_ENABLED,
} from '@/constants/storage-keys'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

const prompt = 'Preferences: {USER_PREFERENCES}\nLanguage: {LANGUAGE}'

describe('useCustomSystemPrompt personalization', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(USER_PREFS_NICKNAME, 'Ada')
  })

  it('includes details when the enabled flag is missing', async () => {
    const { result } = renderHook(() => useCustomSystemPrompt(prompt))

    await waitFor(() =>
      expect(result.current.effectiveSystemPrompt).toContain(
        '<nickname>Ada</nickname>',
      ),
    )
    expect(result.current.isUsingPersonalization).toBe(true)
  })

  it('includes details when explicitly enabled', async () => {
    localStorage.setItem(USER_PREFS_PERSONALIZATION_ENABLED, 'true')
    const { result } = renderHook(() => useCustomSystemPrompt(prompt))

    await waitFor(() =>
      expect(result.current.effectiveSystemPrompt).toContain(
        '<nickname>Ada</nickname>',
      ),
    )
  })

  it('suppresses all details when explicitly disabled', async () => {
    localStorage.setItem(USER_PREFS_PERSONALIZATION_ENABLED, 'false')
    const { result } = renderHook(() => useCustomSystemPrompt(prompt))

    await waitFor(() =>
      expect(result.current.effectiveSystemPrompt).not.toContain(
        '<nickname>Ada</nickname>',
      ),
    )
    expect(result.current.effectiveSystemPrompt).not.toContain(
      '<user_preferences>',
    )
    expect(result.current.isUsingPersonalization).toBe(false)
  })
})
