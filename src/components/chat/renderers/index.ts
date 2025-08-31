// Server-safe exports only
// For client components, import from './client' or './client-exports'

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

// Note: Client components have been moved to './client-exports'
// to prevent forcing server components into client boundary.
// Import client components directly from './client' or './client-exports'
