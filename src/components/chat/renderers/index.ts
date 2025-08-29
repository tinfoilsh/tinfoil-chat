// Central export for all renderers
export { rendererRegistry } from './registry'
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

// Initialize registry with default renderers
import { DefaultInputRenderer } from './default/DefaultInputRenderer'
import { DefaultMessageRenderer } from './default/DefaultMessageRenderer'
import { rendererRegistry } from './registry'

// Register defaults
if (typeof window !== 'undefined') {
  rendererRegistry.setDefaultMessageRenderer(DefaultMessageRenderer)
  rendererRegistry.setDefaultInputRenderer(DefaultInputRenderer)
}
