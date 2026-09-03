import { IS_DEV } from '@/config'
import { streamingTracker } from '@/services/cloud/streaming-tracker'
import type { AguiEventStream } from '@/services/inference/agui/protocol'
import {
  createStreamLogger,
  type StreamLogger,
} from '@/utils/dev-stream-logger'
import type { Message } from '../../types'
import { AnimationFramePublisher } from './animation-frame-publisher'
import { hasVisibleAssistantMessage } from './interrupted-message'
import { RichStreamSession } from './rich-stream-session'
import type { StreamingContext } from './types'

export async function processStreamingResponse(
  stream: AguiEventStream,
  ctx: StreamingContext,
): Promise<Message | null> {
  const streamLogger: StreamLogger | undefined = IS_DEV
    ? createStreamLogger()
    : undefined
  const streamingChatId = ctx.streamChatIdRef.current
  const session = new RichStreamSession({
    trackThinkingDuration: true,
    onFirstEvent: () => ctx.setIsWaitingForResponse(false),
    onThinkingChange: ctx.setIsThinking,
    modelDisplayName: ctx.modelDisplayName,
    resolveModelDisplayName: ctx.resolveModelDisplayName,
  })
  const publisher = new AnimationFramePublisher(ctx.onUpdate)
  let interruptionPublished = false
  let publicationCompleted = false
  let runFailed = false

  const publishInterruption = () => {
    if (interruptionPublished) return
    interruptionPublished = true
    publisher.cancel()
    const message = session.interruptedSnapshot(ctx.turnId)
    ctx.onInterrupted?.(hasVisibleAssistantMessage(message) ? message : null)
  }

  ctx.signal?.addEventListener('abort', publishInterruption, { once: true })
  if (ctx.signal?.aborted) publishInterruption()

  try {
    if (ctx.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (streamingChatId) streamingTracker.startStreaming(streamingChatId)

    for await (const event of stream) {
      if (ctx.signal?.aborted) break
      streamLogger?.logParsedEvent(event)
      runFailed ||= event.type === 'RUN_ERROR'
      if (session.processEvent(event)) {
        publisher.publishLazy(() => session.snapshot(ctx.turnId))
      }
    }

    if (ctx.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const message = session.complete(ctx.turnId)
    if (session.hasChanges) await publisher.finish(message)
    if (ctx.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    publicationCompleted = true
    streamLogger?.flush(streamingChatId)
    return message
  } catch (error) {
    if (!runFailed || ctx.signal?.aborted) throw error
    const message = session.interruptedSnapshot(ctx.turnId)
    if (!hasVisibleAssistantMessage(message)) throw error
    await publisher.finish(message)
    if (ctx.signal?.aborted) throw error
    publicationCompleted = true
    streamLogger?.flush(streamingChatId)
    return message
  } finally {
    if (!publicationCompleted) publisher.cancel()
    if (!ctx.deferStreamCleanup && !ctx.signal?.aborted) {
      ctx.setLoadingState('idle')
      ctx.setIsStreaming(false)
      if (streamingChatId) streamingTracker.endStreaming(streamingChatId)
      if (
        ctx.streamChatIdRef.current &&
        ctx.streamChatIdRef.current !== streamingChatId
      ) {
        streamingTracker.endStreaming(ctx.streamChatIdRef.current)
      }
    }
    session.close()
    ctx.setIsThinking(false)
    ctx.setIsWaitingForResponse(false)
    ctx.signal?.removeEventListener('abort', publishInterruption)
  }
}
