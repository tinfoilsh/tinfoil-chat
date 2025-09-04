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

  'test real stream': {
    thoughts: Array(30)
      .fill(0)
      .map((_, i) => {
        const thoughts = [
          `I need to analyze this request carefully. Let me break down what's being asked...`,
          `The user wants to understand how the streaming mechanism works in production.`,
          `Looking at the codebase structure to identify the key components...`,
          `The streaming uses Server-Sent Events (SSE) to deliver content progressively.`,
          `Character-by-character streaming creates more frequent React re-renders.`,
          `Each update potentially triggers component lifecycle methods.`,
          `Message keys are based on timestamps which must remain stable.`,
          `If timestamps change during streaming, React unmounts and remounts components.`,
          `This would cause any internal state like scroll position to be lost.`,
          `The fix involves preserving the original timestamp throughout the stream.`,
        ]
        return thoughts[i % thoughts.length]
      })
      .join('\n\n'),
    content: `Based on my analysis, here's what happens during real API streaming:

**Key Differences from Simulation:**

1. **Chunk Size**: Real APIs often send individual characters or very small chunks (1-3 chars), especially for reasoning models that stream token by token.

2. **Timing Variability**: Network latency causes irregular intervals between chunks - sometimes 5ms, sometimes 50ms, creating a more unpredictable pattern.

3. **Edge Cases**: Real streaming hits edge cases more frequently:
   - Stream ending mid-thought
   - Buffered content being processed after stream ends
   - Thinking mode transitions at unexpected times

4. **React Rendering**: With character-by-character updates:
   - More frequent re-render checks (potentially 100+ per second)
   - Higher chance of hitting race conditions
   - Greater likelihood of triggering the 5-second sync interval during active streaming

The bug was specifically triggered when:
- Thoughts were expanded during streaming
- User was actively scrolling
- A timestamp recreation occurred (from edge cases or sync)
- React treated it as a new component, resetting scroll position

This simulator pattern mimics production behavior more accurately.`,
    thinkingDurationMs: 8000, // Realistic thinking time
    streamDelayMs: 3, // Very fast, like real API
    chunkSize: 1, // Character by character
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

  'test very long': {
    thoughts: `Preparing to generate an extremely long response to test streaming behavior, scrolling, and performance...

Let me think about how to structure this comprehensive test:
- First, I'll need to include multiple sections with different content types
- Each section should test different aspects of the rendering system
- I should include code blocks to test syntax highlighting
- Lists and tables will help verify formatting preservation
- Performance testing sections with repetitive content
- Mixed content types to ensure everything works together

This thinking phase itself is designed to last approximately 2 seconds with the current streaming settings. The thoughts are being displayed while I prepare the extensive content that follows. This helps test the transition from thinking to content generation, ensuring smooth scrolling and no visual glitches during the switch.

I'll make sure to include enough variety in the content to thoroughly test:
1. Text wrapping and paragraph formatting
2. Markdown rendering for headers and emphasis
3. Code block syntax highlighting
4. List formatting (both ordered and unordered)
5. Table rendering with multiple rows
6. Quote blocks and nested content
7. Performance with very long streaming sessions

The streaming should handle all of this smoothly without degrading the user experience. Let's begin with the actual content now...`,
    content: `# Very Long Streaming Test Response

This is an extensive response designed to test how the application handles very long streaming output. It will include multiple sections, various formatting elements, and enough content to thoroughly test the streaming, rendering, and scrolling behaviors.

## Section 1: Introduction to Long Content

${Array(10)
  .fill(0)
  .map(
    (_, i) =>
      `Paragraph ${i + 1}: This is a substantial paragraph containing detailed information about various topics. It includes multiple sentences to ensure that the content is meaningful and tests the text wrapping behavior properly. The streaming should handle this smoothly without any performance degradation or visual glitches. Each paragraph adds to the overall length of the response, helping us verify that the UI remains responsive even with large amounts of content.`,
  )
  .join('\n\n')}

## Section 2: Technical Details

Let's explore some technical concepts with detailed explanations:

### Subsection 2.1: Architecture Patterns

${Array(5)
  .fill(0)
  .map(
    (_, i) =>
      `**Pattern ${i + 1}**: This architectural pattern involves multiple components working together in a coordinated manner. The implementation requires careful consideration of various factors including scalability, maintainability, and performance. When properly implemented, this pattern provides significant benefits in terms of code organization and system reliability.`,
  )
  .join('\n\n')}

### Subsection 2.2: Code Examples

Here are several code examples to test syntax highlighting with long content:

\`\`\`javascript
// Example 1: Complex async operation
async function performComplexOperation(data) {
  console.log('Starting complex operation...');
  
  try {
    const preprocessed = await preprocessData(data);
    const validated = validateInput(preprocessed);
    
    if (!validated.isValid) {
      throw new Error('Validation failed: ' + validated.errors.join(', '));
    }
    
    const results = await Promise.all([
      processPartA(validated.data),
      processPartB(validated.data),
      processPartC(validated.data)
    ]);
    
    return combineResults(results);
  } catch (error) {
    console.error('Operation failed:', error);
    throw error;
  }
}
\`\`\`

\`\`\`python
# Example 2: Data processing pipeline
import pandas as pd
import numpy as np
from typing import List, Dict, Optional

class DataProcessor:
    def __init__(self, config: Dict):
        self.config = config
        self.pipeline = []
        
    def add_step(self, step_function):
        """Add a processing step to the pipeline"""
        self.pipeline.append(step_function)
        return self
        
    def process(self, data: pd.DataFrame) -> pd.DataFrame:
        """Execute the processing pipeline"""
        result = data.copy()
        
        for i, step in enumerate(self.pipeline):
            print(f"Executing step {i + 1}: {step.__name__}")
            result = step(result)
            
        return result
\`\`\`

## Section 3: Lists and Enumerations

### Ordered Lists

${Array(20)
  .fill(0)
  .map(
    (_, i) =>
      `${i + 1}. List item number ${i + 1}: This is a detailed list item that contains enough text to wrap to multiple lines, ensuring that the list formatting is preserved correctly even with long content. The numbering should remain consistent throughout.`,
  )
  .join('\n')}

### Unordered Lists

${Array(15)
  .fill(0)
  .map(
    (_, i) =>
      `- Bullet point ${i + 1}: Another extensive bullet point with detailed information that tests the rendering of unordered lists with wrapped text content.`,
  )
  .join('\n')}

## Section 4: Tables and Data

| Column A | Column B | Column C | Column D | Column E |
|----------|----------|----------|----------|----------|
${Array(25)
  .fill(0)
  .map(
    (_, i) =>
      `| Data ${i}A | Data ${i}B | Data ${i}C | Data ${i}D | Data ${i}E |`,
  )
  .join('\n')}

## Section 5: Mathematical Content

Here are some mathematical expressions and explanations:

${Array(10)
  .fill(0)
  .map(
    (_, i) =>
      `**Equation ${i + 1}**: When we consider the relationship between variables x and y, we can express it as y = mx + b where m represents the slope and b represents the y-intercept. This linear relationship is fundamental to many mathematical and scientific applications.`,
  )
  .join('\n\n')}

## Section 6: Quoted Content

${Array(8)
  .fill(0)
  .map(
    (_, i) =>
      `> Quote ${i + 1}: "This is a substantial quote that contains philosophical or technical insights. It's long enough to test how the application handles quoted text that spans multiple lines. The formatting should be preserved throughout the streaming process."`,
  )
  .join('\n\n')}

## Section 7: Mixed Content Types

Let's combine different content types to test complex rendering:

### Step-by-step Tutorial

${Array(15)
  .fill(0)
  .map(
    (_, i) =>
      `**Step ${i + 1}**: Detailed instructions for this step, including:
- Prerequisite A for this step
- Prerequisite B for this step
- Important consideration to keep in mind

\`\`\`bash
# Command for step ${i + 1}
command --option value --flag
\`\`\`

Expected output: The system should respond with confirmation that step ${i + 1} has been completed successfully.
`,
  )
  .join('\n')}

## Section 8: Performance Testing Content

${Array(50)
  .fill(0)
  .map(
    (_, i) =>
      `Performance test paragraph ${i + 1}: ${Array(10)
        .fill(0)
        .map(() => 'This sentence tests streaming performance.')
        .join(' ')}`,
  )
  .join('\n\n')}

## Conclusion

This extensive response has tested various aspects of the streaming system:
- Long content streaming without performance degradation
- Proper scrolling behavior as content streams
- Syntax highlighting in code blocks
- Various markdown formatting elements
- List rendering with many items
- Table formatting
- Mixed content types

The streaming should have completed smoothly, and all content should be properly rendered and accessible. The UI should remain responsive throughout the entire streaming process, and users should be able to scroll through all the content without any issues.

---

*End of very long streaming test response*`,
    thinkingDurationMs: 2000,
    streamDelayMs: 5, // Very fast streaming to test performance
    chunkSize: 50, // Larger chunks for efficiency with long content
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
    // Add variance for 'test real stream' to simulate network jitter
    const variance = pattern.chunkSize === 1 ? pattern.streamDelayMs || 0 : 0
    await delay(pattern.streamDelayMs || 40, variance)
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

// Helper for delays with optional variance to simulate network jitter
function delay(ms: number, variance: number = 0): Promise<void> {
  const actualDelay =
    variance > 0
      ? ms + (Math.random() - 0.5) * 2 * variance // ±variance ms
      : ms
  return new Promise((resolve) => setTimeout(resolve, Math.max(1, actualDelay)))
}
