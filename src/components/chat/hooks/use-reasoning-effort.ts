import type { BaseModel } from '@/config/models'
import {
  SETTINGS_REASONING_EFFORT,
  SETTINGS_THINKING_ENABLED,
} from '@/constants/storage-keys'
import { useCallback, useEffect, useState } from 'react'

export type ReasoningEffort = 'low' | 'medium' | 'high'

const DEFAULT_EFFORT: ReasoningEffort = 'medium'

export function useReasoningEffort() {
  const [reasoningEffort, setReasoningEffortState] =
    useState<ReasoningEffort>(DEFAULT_EFFORT)

  useEffect(() => {
    const saved = localStorage.getItem(SETTINGS_REASONING_EFFORT)
    if (saved === 'low' || saved === 'medium' || saved === 'high') {
      setReasoningEffortState(saved)
    }
  }, [])

  const setReasoningEffort = useCallback((effort: ReasoningEffort) => {
    setReasoningEffortState(effort)
    localStorage.setItem(SETTINGS_REASONING_EFFORT, effort)
  }, [])

  return { reasoningEffort, setReasoningEffort }
}

/**
 * Tracks whether the thinking-mode toggle is enabled, for models that expose
 * an on/off thinking flag (rather than graded effort). Persisted globally to
 * localStorage; not per-model. Reads from storage in the lazy initializer so
 * the first render observes the persisted value and submits during the
 * pre-mount window do not send a stale toggle.
 */
export function useThinkingEnabled() {
  const [thinkingEnabled, setThinkingEnabledState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    const saved = window.localStorage.getItem(SETTINGS_THINKING_ENABLED)
    if (saved === 'true' || saved === 'false') {
      return saved === 'true'
    }
    return true
  })

  const setThinkingEnabled = useCallback((enabled: boolean) => {
    setThinkingEnabledState(enabled)
    localStorage.setItem(SETTINGS_THINKING_ENABLED, String(enabled))
  }, [])

  return { thinkingEnabled, setThinkingEnabled }
}

export function isReasoningModel(model: BaseModel | undefined): boolean {
  return !!model?.reasoningConfig
}

export function supportsReasoningEffort(model: BaseModel | undefined): boolean {
  return !!model?.reasoningConfig?.supportsEffort
}

export function supportsThinkingToggle(model: BaseModel | undefined): boolean {
  return !!model?.reasoningConfig?.supportsToggle
}
