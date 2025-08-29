// Server-safe exports only
// For client components, import from './client'

// Registry functions (server-safe)
export { getRendererRegistry, resetRendererRegistry } from './registry'

// Type exports (server-safe)
export type {
  InputRenderProps,
  InputRenderer,
  MessageRenderProps,
  MessageRenderer,
  ProcessedDocument,
  UIProvider,
} from './types'

// Re-export client components from the client barrel for backward compatibility
// Note: These will trigger client boundary when imported
export {
  DefaultInputRenderer,
  DefaultMessageRenderer,
  DocumentList,
  MessageActions,
  MessageContent,
  ThoughtProcess,
  initializeRenderers,
} from './client'
