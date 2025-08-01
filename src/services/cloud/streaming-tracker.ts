class StreamingTracker {
  private streamingChats = new Set<string>()
  private streamEndCallbacks = new Map<string, (() => void)[]>()

  startStreaming(chatId: string): void {
    this.streamingChats.add(chatId)
  }

  endStreaming(chatId: string): void {
    this.streamingChats.delete(chatId)

    // Execute any callbacks waiting for this chat to finish streaming
    const callbacks = this.streamEndCallbacks.get(chatId)
    if (callbacks) {
      callbacks.forEach((callback) => callback())
      this.streamEndCallbacks.delete(chatId)
    }
  }

  isStreaming(chatId: string): boolean {
    return this.streamingChats.has(chatId)
  }

  getStreamingChats(): string[] {
    return Array.from(this.streamingChats)
  }

  // Register a callback to be called when a specific chat finishes streaming
  onStreamEnd(chatId: string, callback: () => void): void {
    if (!this.isStreaming(chatId)) {
      // Chat is not streaming, execute callback immediately
      callback()
      return
    }

    const callbacks = this.streamEndCallbacks.get(chatId) || []
    callbacks.push(callback)
    this.streamEndCallbacks.set(chatId, callbacks)
  }
}

export const streamingTracker = new StreamingTracker()
