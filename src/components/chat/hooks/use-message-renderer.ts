import type { BaseModel } from '@/app/config/models'
import type { Message } from '@/components/chat/types'
import { useMemo } from 'react'
import { DefaultInputRenderer } from '../renderers/default/DefaultInputRenderer'
import { DefaultMessageRenderer } from '../renderers/default/DefaultMessageRenderer'
import { getRendererRegistry } from '../renderers/registry'

export function useMessageRenderer(message: Message, model: BaseModel | null) {
  return useMemo(() => {
    if (!model) return DefaultMessageRenderer
    const registry = getRendererRegistry()
    return registry.getMessageRenderer(message, model)
  }, [message, model])
}

export function useInputRenderer(model: BaseModel | null) {
  return useMemo(() => {
    if (!model) return DefaultInputRenderer
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
