import type { BaseModel } from '@/app/config/models'
import type { Message } from '@/components/chat/types'
import { useMemo } from 'react'
import { DefaultInputRenderer } from '../renderers/default/DefaultInputRenderer'
import { DefaultMessageRenderer } from '../renderers/default/DefaultMessageRenderer'
import { rendererRegistry } from '../renderers/registry'

export function useMessageRenderer(message: Message, model: BaseModel | null) {
  return useMemo(() => {
    if (!model) return DefaultMessageRenderer
    return rendererRegistry.getMessageRenderer(message, model)
  }, [message, model])
}

export function useInputRenderer(model: BaseModel | null) {
  return useMemo(() => {
    if (!model) return DefaultInputRenderer
    return rendererRegistry.getInputRenderer(model)
  }, [model])
}

export function useUIProvider(model: BaseModel | null) {
  return useMemo(() => {
    if (!model) return null
    return rendererRegistry.getProvider(model)
  }, [model])
}
