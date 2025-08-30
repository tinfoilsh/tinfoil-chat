import type { BaseModel } from '@/app/config/models'
import type { Message } from '@/components/chat/types'
import { useMemo } from 'react'
import { getRendererRegistry } from '../renderers/client'

export function useMessageRenderer(message: Message, model: BaseModel) {
  return useMemo(() => {
    const registry = getRendererRegistry()
    return registry.getMessageRenderer(message, model)
  }, [message, model])
}

export function useInputRenderer(model: BaseModel) {
  return useMemo(() => {
    const registry = getRendererRegistry()
    return registry.getInputRenderer(model)
  }, [model])
}

export function useUIProvider(model: BaseModel | null) {
  return useMemo(() => {
    if (!model) return null
    const registry = getRendererRegistry()
    return registry.getProvider(model)
  }, [model])
}
