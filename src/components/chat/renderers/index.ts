// Central export for all renderers
export { getRendererRegistry, resetRendererRegistry } from './registry'
export type {
  InputRenderer,
  InputRenderProps,
  MessageRenderer,
  MessageRenderProps,
  UIProvider,
} from './types'

// Default renderers
export { DefaultInputRenderer } from './default/DefaultInputRenderer'
export { DefaultMessageRenderer } from './default/DefaultMessageRenderer'

// Components
export { DocumentList } from './components/DocumentList'
export { MessageActions } from './components/MessageActions'
export { MessageContent } from './components/MessageContent'
export { ThoughtProcess } from './components/ThoughtProcess'

// Initialization function - should be called explicitly at app startup
import { DefaultInputRenderer } from './default/DefaultInputRenderer'
import { DefaultMessageRenderer } from './default/DefaultMessageRenderer'
import { getRendererRegistry } from './registry'

export function initializeRenderers(): void {
  const registry = getRendererRegistry()
  registry.setDefaultMessageRenderer(DefaultMessageRenderer)
  registry.setDefaultInputRenderer(DefaultInputRenderer)
}
