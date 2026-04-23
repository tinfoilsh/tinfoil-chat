/**
 * Accumulates flat Message fields from the NormalizedEvent stream.
 *
 * The timeline is the canonical state; this assembler produces the legacy
 * flat fields (thoughts, webSearch, urlFetches, etc.) that stored messages
 * and some UI components still read.
 */

import type {
  Annotation,
  Message,
  TimelineBlock,
  URLFetchState,
  WebSearchSource,
  WebSearchState,
} from '../../types'
import type { NormalizedEvent } from './types'

export class MessageAssembler {
  private content = ''
  private thoughts = ''
  private isThinking = false
  private thinkingDuration?: number
  private webSearch?: WebSearchState
  private webSearchBeforeThinking = false
  private thinkingStarted = false
  private urlFetches: URLFetchState[] = []
  private annotations: Annotation[] = []
  private collectedSources: WebSearchSource[] = []
  private searchReasoning = ''
  private timestamp = new Date()

  apply(event: NormalizedEvent): void {
    switch (event.type) {
      case 'thinking_start':
        this.isThinking = true
        this.thinkingStarted = true
        break

      case 'thinking_delta':
        this.thoughts += event.content
        break

      case 'thinking_end':
        this.isThinking = false
        this.thoughts = this.thoughts.trim()
        break

      case 'content_delta':
        this.content += event.content
        this.isThinking = false
        break

      case 'web_search':
        this.applyWebSearch(event)
        break

      case 'url_fetch':
        this.applyURLFetch(event)
        break

      case 'annotation':
        this.collectedSources.push({
          title: event.title,
          url: event.url,
        })
        this.annotations.push({
          type: 'url_citation',
          url_citation: { title: event.title, url: event.url },
        })
        // Update web search sources if active
        if (this.webSearch) {
          this.webSearch = {
            ...this.webSearch,
            sources: [...this.collectedSources],
          }
        }
        break

      case 'search_reasoning':
        this.searchReasoning += event.content
        break
    }
  }

  setThinkingDuration(duration?: number): void {
    this.thinkingDuration = duration
  }

  toMessage(timeline: TimelineBlock[]): Message {
    return {
      role: 'assistant',
      content: this.content,
      timestamp: this.timestamp,
      thoughts: this.thoughts || undefined,
      isThinking: this.isThinking,
      thinkingDuration: this.thinkingDuration,
      webSearch: this.webSearch,
      webSearchBeforeThinking: this.webSearchBeforeThinking || undefined,
      urlFetches: this.urlFetches.length > 0 ? [...this.urlFetches] : undefined,
      annotations:
        this.annotations.length > 0 ? [...this.annotations] : undefined,
      searchReasoning: this.searchReasoning || undefined,
      timeline: [...timeline],
    }
  }

  private applyWebSearch(
    event: Extract<NormalizedEvent, { type: 'web_search' }>,
  ): void {
    const { status, query, sources, reason } = event

    if (status === 'in_progress' && query) {
      this.webSearch = { query, status: 'searching' }
      this.webSearchBeforeThinking = !this.thinkingStarted
    } else if (status === 'completed' && this.webSearch) {
      const resolvedSources = sources
        ? sources.map((s) => ({ title: s.title || s.url, url: s.url }))
        : this.webSearch.sources
      this.webSearch = {
        query: this.webSearch.query,
        status: 'completed',
        sources: resolvedSources,
      }
    } else if (status === 'failed' && this.webSearch) {
      this.webSearch = {
        query: this.webSearch.query,
        status: 'failed',
        sources: [],
      }
    } else if (status === 'blocked') {
      this.webSearch = {
        query,
        status: 'blocked',
        reason,
      }
      this.webSearchBeforeThinking = !this.thinkingStarted
    }
  }

  private applyURLFetch(
    event: Extract<NormalizedEvent, { type: 'url_fetch' }>,
  ): void {
    if (event.status === 'in_progress') {
      if (!this.urlFetches.some((f) => f.id === event.id)) {
        this.urlFetches = [
          ...this.urlFetches,
          { id: event.id, url: event.url, status: 'fetching' },
        ]
      }
    } else {
      const mapped: URLFetchState['status'] =
        event.status === 'blocked' ? 'failed' : event.status
      this.urlFetches = this.urlFetches.map((f) =>
        f.id === event.id ? { ...f, status: mapped } : f,
      )
    }
  }
}
