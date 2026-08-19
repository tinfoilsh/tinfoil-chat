import type { Message } from '@/components/chat/types'
import { logError } from '@/utils/error-handling'

type ProjectMemoryUpdateEvent = {
  type: 'memory-update-needed'
  projectId: string
  messages: Message[]
}

type ProjectsInvalidatedEvent = {
  type: 'projects-invalidated'
}

type ProjectEvent = ProjectMemoryUpdateEvent | ProjectsInvalidatedEvent

type ProjectEventType = ProjectEvent['type']
type EventHandler<T extends ProjectEventType> = (
  event: Extract<ProjectEvent, { type: T }>,
) => void

class ProjectEventsEmitter {
  private handlers: Map<string, Set<EventHandler<any>>> = new Map()

  on<T extends ProjectEventType>(
    type: T,
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

  emit(event: ProjectEvent): void {
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
