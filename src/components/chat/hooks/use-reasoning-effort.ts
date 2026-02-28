import { SETTINGS_REASONING_EFFORT } from '@/constants/storage-keys'
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

export function isReasoningModel(modelName: string): boolean {
  return modelName.toLowerCase().startsWith('gpt-oss')
}
