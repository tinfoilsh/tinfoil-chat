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
    this.messageRenderers.unshift(renderer)
  }

  registerInputRenderer(renderer: InputRenderer) {
    this.inputRenderers.unshift(renderer)
  }

  registerProvider(provider: UIProvider) {
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
      render: ({ message }) => {
        // Return a simple div with the message content
        // This would normally be JSX but we're in a .ts file
        const React = require('react')
        return React.createElement(
          'div',
          { className: 'p-4' },
          React.createElement('p', null, message.content),
        )
      },
    }
  }

  private createFallbackInputRenderer(): InputRenderer {
    return {
      id: 'fallback',
      modelPattern: /.*/,
      canRender: () => true,
      render: ({ onSubmit, input, setInput }) => {
        // Return a simple form
        // This would normally be JSX but we're in a .ts file
        const React = require('react')
        return React.createElement(
          'form',
          {
            onSubmit: (e: React.FormEvent) => {
              e.preventDefault()
              onSubmit(input)
            },
          },
          React.createElement('input', {
            type: 'text',
            value: input,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
              setInput(e.target.value),
            className: 'w-full p-2 border rounded',
          }),
        )
      },
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
