import type { BaseModel } from '@/app/config/models'
import type { Message } from '@/components/chat/types'
import type { InputRenderer, MessageRenderer, UIProvider } from './types'

class RendererRegistry {
  private messageRenderers: MessageRenderer[] = []
  private inputRenderers: InputRenderer[] = []
  private providers: Map<string, UIProvider> = new Map()
  private defaultMessageRenderer: MessageRenderer | null = null
  private defaultInputRenderer: InputRenderer | null = null

  registerMessageRenderer(renderer: MessageRenderer) {
    // Remove existing renderer with same id to prevent duplicates
    this.messageRenderers = this.messageRenderers.filter(
      (r) => r.id !== renderer.id,
    )
    this.messageRenderers.unshift(renderer)
  }

  registerInputRenderer(renderer: InputRenderer) {
    // Remove existing renderer with same id to prevent duplicates
    this.inputRenderers = this.inputRenderers.filter(
      (r) => r.id !== renderer.id,
    )
    this.inputRenderers.unshift(renderer)
  }

  registerProvider(provider: UIProvider) {
    // If provider already exists, remove its old renderers first
    const existingProvider = this.providers.get(provider.id)
    if (existingProvider) {
      this.messageRenderers = this.messageRenderers.filter(
        (r) => r.id !== existingProvider.messageRenderer.id,
      )
      this.inputRenderers = this.inputRenderers.filter(
        (r) => r.id !== existingProvider.inputRenderer.id,
      )
    }

    this.providers.set(provider.id, provider)
    this.registerMessageRenderer(provider.messageRenderer)
    this.registerInputRenderer(provider.inputRenderer)
  }

  setDefaultMessageRenderer(renderer: MessageRenderer) {
    this.defaultMessageRenderer = renderer
  }

  setDefaultInputRenderer(renderer: InputRenderer) {
    this.defaultInputRenderer = renderer
  }

  getMessageRenderer(message: Message, model: BaseModel): MessageRenderer {
    const renderer = this.messageRenderers.find((r) =>
      r.canRender(message, model),
    )
    return (
      renderer ||
      this.defaultMessageRenderer ||
      this.createFallbackMessageRenderer()
    )
  }

  getInputRenderer(model: BaseModel): InputRenderer {
    const renderer = this.inputRenderers.find((r) => r.canRender(model))
    return (
      renderer ||
      this.defaultInputRenderer ||
      this.createFallbackInputRenderer()
    )
  }

  getProvider(model: BaseModel): UIProvider | null {
    for (const provider of this.providers.values()) {
      if (provider.modelPattern.test(model.modelName)) {
        return provider
      }
    }
    return null
  }

  reset() {
    this.messageRenderers = []
    this.inputRenderers = []
    this.providers.clear()
    this.defaultMessageRenderer = null
    this.defaultInputRenderer = null
  }

  private createFallbackMessageRenderer(): MessageRenderer {
    return {
      id: 'fallback',
      modelPattern: /.*/,
      canRender: () => true,
      render: ({ message }) => (
        <div className="p-4">
          <p>{message.content}</p>
        </div>
      ),
    }
  }

  private createFallbackInputRenderer(): InputRenderer {
    return {
      id: 'fallback',
      modelPattern: /.*/,
      canRender: () => true,
      render: ({ onSubmit, input, setInput }) => (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit(input)
          }}
        >
          <input
            type="text" aria-label="Message input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full rounded border p-2"
          />
        </form>
      ),
    }
  }
}

let registryInstance: RendererRegistry | null = null

export function getRendererRegistry(): RendererRegistry {
  if (!registryInstance) {
    registryInstance = new RendererRegistry()
  }
  return registryInstance
}

export function resetRendererRegistry(): void {
  if (registryInstance) {
    registryInstance.reset()
  }
  registryInstance = null
}
