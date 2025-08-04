// Event system for migration notifications
export type MigrationEventType = 'migration-completed'

export interface MigrationEvent {
  type: MigrationEventType
  migratedCount: number
}

class MigrationEventEmitter extends EventTarget {
  emit(event: MigrationEvent) {
    this.dispatchEvent(new CustomEvent(event.type, { detail: event }))
  }

  on(type: MigrationEventType, callback: (event: MigrationEvent) => void) {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<MigrationEvent>
      callback(customEvent.detail)
    }
    this.addEventListener(type, handler)
    return () => this.removeEventListener(type, handler)
  }
}

export const migrationEvents = new MigrationEventEmitter()
