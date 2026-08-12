import type { Message } from '@/components/chat/types'
import {
  REASONING_HISTORY_POLICIES,
  shouldIncludeReasoning,
  type ReasoningHistoryPolicy,
} from '@/utils/reasoning-history'

// Fraction of the model's context window reserved for conversation history;
// the remainder is headroom for the system prompt and the model's response.
export const CONTEXT_WINDOW_USAGE_RATIO = 0.9

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 64000

export type ContextWindowConfig = {
  contextWindowTokens?: number
  contextWindow?: string
}

// Roughly estimate token count based on character length (≈4 chars per token)
export function estimateTokenCount(text: string | undefined): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

// Any parsed window below this is treated as an unrecognized format (e.g. a
// suffix this parser predates) rather than a real limit; zeroing the budget
// would silently archive the whole conversation.
const MIN_PLAUSIBLE_CONTEXT_WINDOW_TOKENS = 1000

// Parse values like "64k tokens" → 64000 or "1M tokens" → 1000000
export function parseContextWindowTokens(contextWindow?: string): number {
  if (!contextWindow) return DEFAULT_CONTEXT_WINDOW_TOKENS
  const match = contextWindow.match(/(\d+(?:\.\d+)?)\s*([km])?/i)
  if (!match) return DEFAULT_CONTEXT_WINDOW_TOKENS
  let tokens = parseFloat(match[1])
  const suffix = match[2]?.toLowerCase()
  if (suffix === 'k') tokens *= 1_000
  if (suffix === 'm') tokens *= 1_000_000
  tokens = Math.round(tokens)
  if (tokens < MIN_PLAUSIBLE_CONTEXT_WINDOW_TOKENS) {
    return DEFAULT_CONTEXT_WINDOW_TOKENS
  }
  return tokens
}

export function resolveContextWindowTokens(
  config: ContextWindowConfig | undefined,
): number {
  const configuredTokens = config?.contextWindowTokens
  if (
    Number.isFinite(configuredTokens) &&
    configuredTokens !== undefined &&
    configuredTokens >= MIN_PLAUSIBLE_CONTEXT_WINDOW_TOKENS
  ) {
    return Math.round(configuredTokens)
  }
  return parseContextWindowTokens(config?.contextWindow)
}

export function getSmallestContextWindowTokens(
  configs: ContextWindowConfig[],
): number | undefined {
  if (configs.length === 0) return undefined
  return Math.min(...configs.map(resolveContextWindowTokens))
}

export type TokenEstimationOptions = {
  reasoningHistoryPolicy?: ReasoningHistoryPolicy
  keepMostRecent?: boolean
}

// Estimate the tokens a message contributes to the prompt, including quoted
// text, attachment contents, assistant tool calls, and reasoning when the
// selected model requires it to be returned in subsequent requests.
export function estimateMessageTokens(
  msg: Message,
  options: TokenEstimationOptions = {},
): number {
  let tokens = estimateTokenCount(msg.content)
  if (
    msg.role === 'assistant' &&
    shouldIncludeReasoning(
      options.reasoningHistoryPolicy ?? REASONING_HISTORY_POLICIES.none,
      Boolean(msg.toolCalls?.length),
    )
  ) {
    tokens += estimateTokenCount(msg.thoughts)
  }
  if (msg.searchReasoning) {
    tokens += estimateTokenCount(msg.searchReasoning)
  }
  if (msg.toolCalls) {
    for (const toolCall of msg.toolCalls) {
      tokens += estimateTokenCount(toolCall.name)
      tokens += estimateTokenCount(toolCall.arguments)
    }
  }
  if (msg.quote) {
    tokens += estimateTokenCount(msg.quote)
  }
  if (msg.attachments) {
    for (const attachment of msg.attachments) {
      tokens += estimateTokenCount(attachment.textContent)
      tokens += estimateTokenCount(attachment.description)
    }
  }
  if (msg.documentContent) {
    tokens += estimateTokenCount(msg.documentContent)
  }
  return tokens
}

export function getContextTokenBudget(contextWindowTokens?: number): number {
  return Math.floor(
    (contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW_TOKENS) *
      CONTEXT_WINDOW_USAGE_RATIO,
  )
}

export function getHistoryTokenBudget(
  contextWindowTokens?: number,
  pendingTokens = 0,
): number {
  return Math.max(0, getContextTokenBudget(contextWindowTokens) - pendingTokens)
}

/**
 * Returns the index of the first message (from the end) that fits within the
 * token budget. Messages before this index are "archived" and excluded from
 * the prompt. The most recent message is always included, even if it alone
 * exceeds the budget.
 */
export function findContextStartIndex(
  messages: Message[],
  budgetTokens: number,
  options: TokenEstimationOptions = {},
): number {
  let usedTokens = 0
  const keepMostRecent = options.keepMostRecent ?? true
  for (let i = messages.length - 1; i >= 0; i--) {
    usedTokens += estimateMessageTokens(messages[i], options)
    if (
      usedTokens > budgetTokens &&
      (!keepMostRecent || i < messages.length - 1)
    ) {
      return i + 1
    }
  }
  return 0
}

/**
 * Selects the most recent messages that fit within the model's context
 * token budget.
 */
export function selectMessagesWithinBudget(
  messages: Message[],
  contextWindowTokens?: number,
  options: TokenEstimationOptions = {},
): Message[] {
  const budget = getContextTokenBudget(contextWindowTokens)
  return messages.slice(findContextStartIndex(messages, budget, options))
}
