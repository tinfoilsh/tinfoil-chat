import type { BaseModel } from '@/app/config/models'

// Dev simulator model configuration
export const DEV_SIMULATOR_MODEL: BaseModel = {
  modelName: 'dev-simulator',
  image: '🧪',
  name: 'Dev Simulator',
  nameShort: 'Dev',
  description: 'Development model for testing streaming and thinking behaviors',
  details:
    'Simulates various streaming patterns including thinking, content generation, and edge cases',
  parameters: 'Configurable via query patterns',
  contextWindow: '32k tokens',
  recommendedUse: 'Testing and development only',
  type: 'chat',
  chat: true,
  paid: false,
  multimodal: false,
  endpoint: '/api/dev/simulator',
}

// Simulator response patterns
export interface SimulatorPattern {
  thoughts?: string
  content: string
  thinkingDurationMs?: number
  streamDelayMs?: number
  chunkSize?: number
}

// Predefined test patterns
export const SIMULATOR_PATTERNS: Record<string, SimulatorPattern> = {
  'test thoughts': {
    thoughts: `Let me think about this request step by step...
    
First, I need to understand what you're asking for.
You want me to demonstrate the thinking process.

This is a longer thought process that will help test:
- How the UI handles thoughts appearing
- The transition from thinking to content
- Scrolling behavior during the transition
- Layout stability when content starts streaming

I should provide a detailed response after thinking...`,
    content: `Here's my response after thinking:

This is the actual content that appears after the thinking phase. It demonstrates how the interface handles the transition from thoughts to the main response.

The key points are:
1. Thoughts appear first with a thinking indicator
2. Content starts streaming after thoughts complete
3. The UI should scroll appropriately to keep content visible
4. No layout jumps should occur during transitions

This response includes multiple paragraphs to test scrolling behavior when longer content is generated after a thinking phase.`,
    thinkingDurationMs: 3000,
    streamDelayMs: 50,
    chunkSize: 5,
  },

  'test long thoughts': {
    thoughts: Array(50)
      .fill(0)
      .map(
        (_, i) =>
          `Thought ${i + 1}: Processing complex information and considering various factors...`,
      )
      .join('\n'),
    content: 'Brief response after extensive thinking.',
    thinkingDurationMs: 5000,
    streamDelayMs: 30,
    chunkSize: 10,
  },

  'test no thoughts': {
    content: `This is a direct response without any thinking phase.
    
It goes straight to generating content, which is the traditional behavior.
The streaming should work smoothly without any thinking indicator.`,
    streamDelayMs: 40,
    chunkSize: 8,
  },

  'test rapid': {
    thoughts: 'Quick thought...',
    content: 'Rapid response!',
    thinkingDurationMs: 500,
    streamDelayMs: 10,
    chunkSize: 20,
  },

  'test edge case': {
    thoughts: '', // Empty thoughts but with thinking phase
    content: 'Testing edge case with empty thoughts but thinking indicator.',
    thinkingDurationMs: 1000,
    streamDelayMs: 50,
    chunkSize: 5,
  },

  'test code': {
    thoughts: `Analyzing the code request...
Need to generate proper formatted code with syntax highlighting.`,
    content: `Here's a code example:

\`\`\`typescript
function testFunction() {
  // This tests code rendering after thoughts
  const result = 'Hello World';
  return result;
}
\`\`\`

The code block should render properly after the thinking phase.`,
    thinkingDurationMs: 2000,
    streamDelayMs: 30,
    chunkSize: 10,
  },
}

// Default pattern for unmatched queries
const DEFAULT_PATTERN: SimulatorPattern = {
  thoughts: `Processing your request...
Analyzing the input to generate an appropriate response.`,
  content: `This is the default simulated response.

Your query: "{query}"

The simulator is working correctly and streaming this response with:
- Thinking phase duration: 2 seconds
- Streaming delay: 40ms between chunks
- Chunk size: 7 characters`,
  thinkingDurationMs: 2000,
  streamDelayMs: 40,
  chunkSize: 7,
}

// Get pattern based on query
export function getSimulatorPattern(query: string): SimulatorPattern {
  const lowerQuery = query.toLowerCase()

  // Check for exact matches first
  for (const [key, pattern] of Object.entries(SIMULATOR_PATTERNS)) {
    if (lowerQuery === key) {
      return pattern
    }
  }

  // Check for partial matches
  for (const [key, pattern] of Object.entries(SIMULATOR_PATTERNS)) {
    if (lowerQuery.includes(key)) {
      return pattern
    }
  }

  // Return default with query interpolated
  return {
    ...DEFAULT_PATTERN,
    content: DEFAULT_PATTERN.content.replace('{query}', query),
  }
}

// Simulate streaming with thinking support
export async function* simulateStream(
  query: string,
  onThinkingStart?: () => void,
  onThinkingEnd?: () => void,
): AsyncGenerator<string, void, unknown> {
  const pattern = getSimulatorPattern(query)

  await delay(1000)

  // If there are thoughts, yield them first with thinking tags
  if (pattern.thoughts) {
    // Start with thinking tag
    yield 'data: {"choices":[{"delta":{"content":"<think>"}}]}\n\n'

    if (onThinkingStart) {
      onThinkingStart()
    }

    // Stream thoughts in chunks
    const thoughtChunks = chunkText(pattern.thoughts, pattern.chunkSize || 5)
    for (const chunk of thoughtChunks) {
      yield `data: {"choices":[{"delta":{"content":"${escapeJson(chunk)}"}}]}\n\n`
      await delay(pattern.streamDelayMs || 40)
    }

    // End thinking tag
    yield 'data: {"choices":[{"delta":{"content":"</think>\\n\\n"}}]}\n\n'

    // Simulate thinking duration
    if (pattern.thinkingDurationMs) {
      await delay(pattern.thinkingDurationMs)
    }

    if (onThinkingEnd) {
      onThinkingEnd()
    }
  }

  // Stream main content in chunks
  const contentChunks = chunkText(pattern.content, pattern.chunkSize || 7)
  for (const chunk of contentChunks) {
    yield `data: {"choices":[{"delta":{"content":"${escapeJson(chunk)}"}}]}\n\n`
    await delay(pattern.streamDelayMs || 40)
  }

  // Send done signal
  yield 'data: [DONE]\n\n'
}

// Helper to chunk text
function chunkText(text: string, chunkSize: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize))
  }
  return chunks
}

// Helper to escape JSON strings
function escapeJson(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

// Helper for delays
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
