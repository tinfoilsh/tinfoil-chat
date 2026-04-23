import { MessageAssembler } from '@/components/chat/hooks/streaming/message-assembler'
import { describe, expect, it } from 'vitest'

describe('MessageAssembler', () => {
  describe('content accumulation', () => {
    it('accumulates content_delta events', () => {
      const asm = new MessageAssembler()
      asm.apply({ type: 'content_delta', content: 'hello' })
      asm.apply({ type: 'content_delta', content: ' world' })

      const msg = asm.toMessage([])
      expect(msg.content).toBe('hello world')
      expect(msg.role).toBe('assistant')
    })
  })

  describe('thinking', () => {
    it('accumulates thinking events', () => {
      const asm = new MessageAssembler()
      asm.apply({ type: 'thinking_start' })
      asm.apply({ type: 'thinking_delta', content: 'let me think' })
      asm.apply({ type: 'thinking_end' })
      asm.setThinkingDuration(2.5)

      const msg = asm.toMessage([])
      expect(msg.thoughts).toBe('let me think')
      expect(msg.isThinking).toBe(false)
      expect(msg.thinkingDuration).toBe(2.5)
    })

    it('shows isThinking=true during active thinking', () => {
      const asm = new MessageAssembler()
      asm.apply({ type: 'thinking_start' })
      asm.apply({ type: 'thinking_delta', content: 'thinking...' })

      const msg = asm.toMessage([])
      expect(msg.isThinking).toBe(true)
    })

    it('trims thoughts on thinking_end', () => {
      const asm = new MessageAssembler()
      asm.apply({ type: 'thinking_start' })
      asm.apply({ type: 'thinking_delta', content: '  padded  ' })
      asm.apply({ type: 'thinking_end' })

      expect(asm.toMessage([]).thoughts).toBe('padded')
    })

    it('content_delta sets isThinking to false', () => {
      const asm = new MessageAssembler()
      asm.apply({ type: 'thinking_start' })
      asm.apply({ type: 'content_delta', content: 'answer' })

      expect(asm.toMessage([]).isThinking).toBe(false)
    })
  })

  describe('web search', () => {
    it('tracks in_progress web search', () => {
      const asm = new MessageAssembler()
      asm.apply({ type: 'web_search', status: 'in_progress', query: 'test' })

      const msg = asm.toMessage([])
      expect(msg.webSearch?.query).toBe('test')
      expect(msg.webSearch?.status).toBe('searching')
    })

    it('updates to completed with sources', () => {
      const asm = new MessageAssembler()
      asm.apply({ type: 'web_search', status: 'in_progress', query: 'test' })
      asm.apply({
        type: 'web_search',
        status: 'completed',
        sources: [{ url: 'https://a.com', title: 'A' }],
      })

      const msg = asm.toMessage([])
      expect(msg.webSearch?.status).toBe('completed')
      expect(msg.webSearch?.sources).toHaveLength(1)
    })

    it('handles failed status', () => {
      const asm = new MessageAssembler()
      asm.apply({ type: 'web_search', status: 'in_progress', query: 'test' })
      asm.apply({ type: 'web_search', status: 'failed' })

      expect(asm.toMessage([]).webSearch?.status).toBe('failed')
    })

    it('handles blocked status with reason', () => {
      const asm = new MessageAssembler()
      asm.apply({
        type: 'web_search',
        status: 'blocked',
        query: 'bad query',
        reason: 'policy',
      })

      const msg = asm.toMessage([])
      expect(msg.webSearch?.status).toBe('blocked')
      expect(msg.webSearch?.reason).toBe('policy')
    })

    it('tracks webSearchBeforeThinking correctly', () => {
      const asm = new MessageAssembler()
      // Search before any thinking
      asm.apply({ type: 'web_search', status: 'in_progress', query: 'q' })
      expect(asm.toMessage([]).webSearchBeforeThinking).toBe(true)

      // Now with thinking first
      const asm2 = new MessageAssembler()
      asm2.apply({ type: 'thinking_start' })
      asm2.apply({ type: 'thinking_end' })
      asm2.apply({ type: 'web_search', status: 'in_progress', query: 'q' })
      expect(asm2.toMessage([]).webSearchBeforeThinking).toBeUndefined()
    })
  })

  describe('URL fetches', () => {
    it('adds URL fetches with deduplication', () => {
      const asm = new MessageAssembler()
      asm.apply({
        type: 'url_fetch',
        id: 'f1',
        url: 'https://a.com',
        status: 'in_progress',
      })
      asm.apply({
        type: 'url_fetch',
        id: 'f1',
        url: 'https://a.com',
        status: 'in_progress',
      })

      expect(asm.toMessage([]).urlFetches).toHaveLength(1)
    })

    it('updates fetch status', () => {
      const asm = new MessageAssembler()
      asm.apply({
        type: 'url_fetch',
        id: 'f1',
        url: 'https://a.com',
        status: 'in_progress',
      })
      asm.apply({
        type: 'url_fetch',
        id: 'f1',
        url: 'https://a.com',
        status: 'completed',
      })

      expect(asm.toMessage([]).urlFetches![0].status).toBe('completed')
    })

    it('maps blocked status to failed', () => {
      const asm = new MessageAssembler()
      asm.apply({
        type: 'url_fetch',
        id: 'f1',
        url: 'https://a.com',
        status: 'in_progress',
      })
      asm.apply({
        type: 'url_fetch',
        id: 'f1',
        url: 'https://a.com',
        status: 'blocked',
      })

      expect(asm.toMessage([]).urlFetches![0].status).toBe('failed')
    })
  })

  describe('annotations', () => {
    it('collects annotations and updates web search sources', () => {
      const asm = new MessageAssembler()
      asm.apply({ type: 'web_search', status: 'in_progress', query: 'q' })
      asm.apply({ type: 'annotation', url: 'https://a.com', title: 'A' })
      asm.apply({ type: 'annotation', url: 'https://b.com', title: 'B' })

      const msg = asm.toMessage([])
      expect(msg.annotations).toHaveLength(2)
      expect(msg.webSearch?.sources).toHaveLength(2)
    })
  })

  describe('search reasoning', () => {
    it('accumulates search reasoning', () => {
      const asm = new MessageAssembler()
      asm.apply({ type: 'search_reasoning', content: 'part1' })
      asm.apply({ type: 'search_reasoning', content: 'part2' })

      expect(asm.toMessage([]).searchReasoning).toBe('part1part2')
    })
  })

  describe('toMessage', () => {
    it('passes timeline through', () => {
      const asm = new MessageAssembler()
      const timeline = [
        { type: 'content' as const, id: 'c-0', content: 'test' },
      ]
      const msg = asm.toMessage(timeline)
      expect(msg.timeline).toEqual(timeline)
    })

    it('omits undefined optional fields', () => {
      const asm = new MessageAssembler()
      const msg = asm.toMessage([])
      expect(msg.thoughts).toBeUndefined()
      expect(msg.webSearch).toBeUndefined()
      expect(msg.urlFetches).toBeUndefined()
      expect(msg.annotations).toBeUndefined()
      expect(msg.searchReasoning).toBeUndefined()
    })
  })
})
