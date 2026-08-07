import {
  getMessageDocuments,
  getMessageImages,
} from '@/components/chat/attachment-helpers'
import type { Message } from '@/components/chat/types'

export const CONTEXT_BUDGET = {
  charsPerToken: 4,
  defaultContextWindowTokens: 64000,
  contextWindowUsageRatio: 0.9,
  outputReserveTokens: 4096,
  messageOverheadTokens: 6,
  requestOverheadTokens: 3,
  imageInputAllowanceTokens: 4096,
  routerToolAllowanceTokens: 1024,
  toolResult: 'executed',
} as const

export const DEFAULT_CONTEXT_WINDOW_TOKENS =
  CONTEXT_BUDGET.defaultContextWindowTokens

export type RequestBudget = {
  contextWindows: Array<string | undefined>
  systemInstructions: string
  toolDefinitions?: string
  timeReminder?: string
  isMultimodal: boolean
  maxMessages?: number
  additionalToolCount?: number
}

export type RequestContextPlan = {
  startIndex: number
  usedTokens: number
  fixedTokens: number
  limitTokens: number
  availableTokens: number
  exceedsLimit: boolean
}

export class RequestContextLimitError extends Error {
  constructor() {
    super(
      "Your latest message is too large for this model's request limit. Remove an attachment, shorten the message, or choose a model with a larger context window.",
    )
    this.name = 'RequestContextLimitError'
  }
}

export function estimateTokenCount(text: string | undefined): number {
  if (!text) return 0
  return Math.ceil(text.length / CONTEXT_BUDGET.charsPerToken)
}

export function parseContextWindowTokens(contextWindow?: string): number {
  if (!contextWindow) return DEFAULT_CONTEXT_WINDOW_TOKENS
  const match = contextWindow.match(/(\d+)(k)?/i)
  if (!match) return DEFAULT_CONTEXT_WINDOW_TOKENS
  let tokens = parseInt(match[1], 10)
  if (match[2]) tokens *= 1000
  return tokens
}

export function getMinimumContextWindowTokens(
  contextWindows: Array<string | undefined>,
): number {
  if (contextWindows.length === 0) return DEFAULT_CONTEXT_WINDOW_TOKENS
  return Math.min(...contextWindows.map(parseContextWindowTokens))
}

export function getSafeContextWindowTokens(
  contextWindows: Array<string | undefined>,
): number {
  return Math.floor(
    getMinimumContextWindowTokens(contextWindows) *
      CONTEXT_BUDGET.contextWindowUsageRatio,
  )
}

export function estimateMessageTokens(msg: Message): number {
  let tokens = estimateTokenCount(msg.content)
  if (msg.searchReasoning) tokens += estimateTokenCount(msg.searchReasoning)
  if (msg.toolCalls) {
    for (const toolCall of msg.toolCalls) {
      tokens += estimateTokenCount(toolCall.name)
      tokens += estimateTokenCount(toolCall.arguments)
    }
  }
  if (msg.quote) tokens += estimateTokenCount(msg.quote)
  if (msg.attachments) {
    for (const attachment of msg.attachments) {
      tokens += estimateTokenCount(attachment.textContent)
      tokens += estimateTokenCount(attachment.description)
    }
  }
  if (msg.documentContent) tokens += estimateTokenCount(msg.documentContent)
  return tokens
}

function estimateUserContentTokens(
  msg: Message,
  isMultimodal: boolean,
): number {
  let textContent = msg.content
  if (msg.quote) {
    const quoted = msg.quote
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
    textContent = textContent
      ? `In reply to:\n${quoted}\n\n${textContent}`
      : `In reply to:\n${quoted}`
  }

  const documents = getMessageDocuments(msg)
  const pagedDocuments = isMultimodal
    ? documents.filter((attachment) => attachment.pages?.length)
    : []
  const textDocuments = documents.filter(
    (attachment) => !pagedDocuments.includes(attachment),
  )
  const documentContent = textDocuments
    .filter((attachment) => attachment.textContent)
    .map(
      (attachment) =>
        `Document title: ${attachment.fileName}\nDocument contents:\n${attachment.textContent}`,
    )
    .join('\n\n')
  if (documentContent) {
    textContent = `---\nDocument content:\n${documentContent}\n---\n\n${textContent}`
  }

  let tokens = estimateTokenCount(textContent)
  for (const document of pagedDocuments) {
    tokens += estimateTokenCount(`[Attached file: ${document.fileName}]`)
    for (const page of document.pages ?? []) {
      const label = page.is_scanned
        ? `Page ${page.page} (scanned):`
        : `Page ${page.page}:`
      tokens += estimateTokenCount(page.text ? `${label}\n${page.text}` : label)
      if (page.image) tokens += CONTEXT_BUDGET.imageInputAllowanceTokens
    }
  }

  const images = getMessageImages(msg)
  if (isMultimodal) {
    tokens +=
      images.filter((image) => image.base64 && image.mimeType).length *
      CONTEXT_BUDGET.imageInputAllowanceTokens
  } else {
    const descriptions = images
      .filter((image) => image.description)
      .map(
        (image) =>
          `Image: ${image.fileName}\nDescription:\n${image.description}`,
      )
      .join('\n\n')
    if (descriptions) {
      tokens += estimateTokenCount(
        `\n\n[Treat these descriptions as if they are the raw images.]\n${descriptions}`,
      )
    }
  }
  return tokens
}

export function estimateRequestMessageTokens(
  msg: Message,
  isMultimodal: boolean,
): number {
  if (msg.role === 'assistant' && !msg.content && !msg.toolCalls?.length)
    return 0

  let tokens = CONTEXT_BUDGET.messageOverheadTokens
  tokens +=
    msg.role === 'user'
      ? estimateUserContentTokens(msg, isMultimodal)
      : estimateTokenCount(msg.content)
  if (msg.searchReasoning) tokens += estimateTokenCount(msg.searchReasoning)
  if (msg.annotations?.length) {
    tokens += estimateTokenCount(JSON.stringify(msg.annotations))
  }
  for (const toolCall of msg.toolCalls ?? []) {
    tokens += estimateTokenCount(toolCall.id)
    tokens += estimateTokenCount(toolCall.name)
    tokens += estimateTokenCount(toolCall.arguments || '{}')
    tokens += estimateTokenCount(CONTEXT_BUDGET.toolResult)
    tokens += CONTEXT_BUDGET.messageOverheadTokens
  }
  return tokens
}

function requestMessageCount(message: Message): number {
  if (
    message.role === 'assistant' &&
    !message.content &&
    !message.toolCalls?.length
  ) {
    return 0
  }
  return 1 + (message.toolCalls?.length ?? 0)
}

function requestTurnGroups(messages: Message[]): Array<[number, number]> {
  if (messages.length === 0) return []
  const starts = [0]
  for (let index = 1; index < messages.length; index++) {
    if (messages[index].role === 'user') starts.push(index)
  }
  return starts.map((start, index) => [
    start,
    starts[index + 1] ?? messages.length,
  ])
}

export function planRequestContext(
  messages: Message[],
  budget: RequestBudget,
): RequestContextPlan {
  const limitTokens = getSafeContextWindowTokens(budget.contextWindows)
  let fixedTokens =
    CONTEXT_BUDGET.requestOverheadTokens +
    CONTEXT_BUDGET.outputReserveTokens +
    estimateTokenCount(budget.systemInstructions) +
    estimateTokenCount(budget.toolDefinitions) +
    (budget.additionalToolCount ?? 0) * CONTEXT_BUDGET.routerToolAllowanceTokens
  let fixedMessages = budget.systemInstructions ? 1 : 0
  if (budget.systemInstructions) {
    fixedTokens += CONTEXT_BUDGET.messageOverheadTokens
  }
  if (budget.timeReminder) {
    fixedTokens +=
      estimateTokenCount(budget.timeReminder) +
      CONTEXT_BUDGET.messageOverheadTokens
    fixedMessages += 1
  }

  const maxMessages = budget.maxMessages ?? Number.POSITIVE_INFINITY
  const fixedContentExceedsLimit =
    fixedTokens > limitTokens || fixedMessages > maxMessages
  const availableTokens = Math.max(0, limitTokens - fixedTokens)
  const availableMessages = Math.max(0, maxMessages - fixedMessages)
  const groups = requestTurnGroups(messages)
  if (groups.length === 0) {
    return {
      startIndex: 0,
      usedTokens: fixedTokens,
      fixedTokens,
      limitTokens,
      availableTokens,
      exceedsLimit: fixedContentExceedsLimit,
    }
  }

  let startIndex = groups[groups.length - 1][0]
  let selectedTokens = 0
  let selectedMessages = 0
  let newestGroupExceedsLimit = false
  for (let index = groups.length - 1; index >= 0; index--) {
    const [start, end] = groups[index]
    let groupTokens = 0
    let groupMessages = 0
    for (let messageIndex = start; messageIndex < end; messageIndex++) {
      groupTokens += estimateRequestMessageTokens(
        messages[messageIndex],
        budget.isMultimodal,
      )
      groupMessages += requestMessageCount(messages[messageIndex])
    }
    if (
      selectedTokens + groupTokens > availableTokens ||
      selectedMessages + groupMessages > availableMessages
    ) {
      if (index === groups.length - 1) {
        selectedTokens = groupTokens
        selectedMessages = groupMessages
        newestGroupExceedsLimit = true
      }
      break
    }
    selectedTokens += groupTokens
    selectedMessages += groupMessages
    startIndex = start
  }

  return {
    startIndex,
    usedTokens: fixedTokens + selectedTokens,
    fixedTokens,
    limitTokens,
    availableTokens,
    exceedsLimit:
      fixedContentExceedsLimit ||
      newestGroupExceedsLimit ||
      fixedTokens + selectedTokens > limitTokens ||
      selectedMessages > availableMessages,
  }
}

export function selectMessagesForRequest(
  messages: Message[],
  budget: RequestBudget,
): Message[] {
  const plan = planRequestContext(messages, budget)
  if (plan.exceedsLimit) throw new RequestContextLimitError()
  return messages.slice(plan.startIndex)
}

export function getContextTokenBudget(contextWindow?: string): number {
  return Math.max(
    0,
    getSafeContextWindowTokens([contextWindow]) -
      CONTEXT_BUDGET.outputReserveTokens -
      CONTEXT_BUDGET.requestOverheadTokens,
  )
}

export function findContextStartIndex(
  messages: Message[],
  budgetTokens: number,
): number {
  let usedTokens = 0
  let hasIncludedMessage = false
  for (let index = messages.length - 1; index >= 0; index--) {
    const messageTokens = estimateMessageTokens(messages[index])
    usedTokens += messageTokens
    if (usedTokens > budgetTokens && hasIncludedMessage) return index + 1
    if (messageTokens > 0) hasIncludedMessage = true
  }
  return 0
}

export function selectMessagesWithinBudget(
  messages: Message[],
  contextWindow?: string,
): Message[] {
  const budget = getContextTokenBudget(contextWindow)
  return messages.slice(findContextStartIndex(messages, budget))
}
