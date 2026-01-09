import { logError } from '@/utils/error-handling'

type ProjectSummaryUpdateEvent = {
  type: 'summary-update-needed'
  projectId: string
  userMessage: string
  assistantResponse: string
}

type ProjectEvent = ProjectSummaryUpdateEvent

type EventHandler<T extends ProjectEvent> = (event: T) => void

class ProjectEventsEmitter {
  private handlers: Map<string, Set<EventHandler<any>>> = new Map()

  on<T extends ProjectEvent>(
    type: T['type'],
    handler: EventHandler<T>,
  ): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set())
    }
    this.handlers.get(type)!.add(handler)

    return () => {
      this.handlers.get(type)?.delete(handler)
    }
  }

  emit<T extends ProjectEvent>(event: T): void {
    const handlers = this.handlers.get(event.type)
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(event)
        } catch (error) {
          logError('Project event handler failed', error, {
            component: 'ProjectEventsEmitter',
            action: 'emit',
            metadata: { eventType: event.type },
          })
        }
      })
    }
  }

  clear(): void {
    this.handlers.clear()
  }
}

export const projectEvents = new ProjectEventsEmitter()
