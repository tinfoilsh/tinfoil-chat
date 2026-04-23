import { IS_DEV } from '@/config'

interface LogEntry {
  t: number
  type: string
  data: unknown
}

export interface StreamLogger {
  logRaw(line: string): void
  logParsedEvent(json: unknown): void
  logTinfoilEvent(event: unknown): void
  logWebSearchDispatch(event: unknown): void
  flush(chatId: string): void
}

const noopLogger: StreamLogger = {
  logRaw() {},
  logParsedEvent() {},
  logTinfoilEvent() {},
  logWebSearchDispatch() {},
  flush() {},
}

export function createStreamLogger(): StreamLogger {
  if (!IS_DEV) return noopLogger

  const entries: LogEntry[] = []

  return {
    logRaw(line: string) {
      entries.push({ t: Date.now(), type: 'raw', data: line })
    },

    logParsedEvent(json: unknown) {
      entries.push({ t: Date.now(), type: 'parsed', data: json })
    },

    logTinfoilEvent(event: unknown) {
      entries.push({ t: Date.now(), type: 'tinfoil_event', data: event })
    },

    logWebSearchDispatch(event: unknown) {
      entries.push({ t: Date.now(), type: 'web_search_dispatch', data: event })
    },

    flush(chatId: string) {
      if (entries.length === 0) return
      const payload = { chatId, events: entries }
      fetch('/api/dev/stream-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {
        // Dev-only, silently ignore failures
      })
    },
  }
}
