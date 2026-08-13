import { streamingTracker } from '@/services/cloud/streaming-tracker'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('streamingTracker account reset', () => {
  beforeEach(() => {
    streamingTracker.reset()
  })

  it('clears streaming, pending, and deferred callbacks', () => {
    const callback = vi.fn()
    streamingTracker.startStreaming('chat-1')
    streamingTracker.beginPendingStream('chat-2')
    streamingTracker.onStreamEnd('chat-1', callback)

    streamingTracker.reset()
    streamingTracker.endStreaming('chat-1')

    expect(streamingTracker.getStreamingChats()).toEqual([])
    expect(streamingTracker.isStreamingOrPending('chat-1')).toBe(false)
    expect(streamingTracker.isStreamingOrPending('chat-2')).toBe(false)
    expect(callback).not.toHaveBeenCalled()
  })
})
