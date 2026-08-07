import { StreamingChunkedText } from '@/components/chat/renderers/components/StreamingChunkedText'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('StreamingChunkedText', () => {
  it('does not visually mask a short live response', () => {
    const { container } = render(
      <StreamingChunkedText
        content="Hi"
        isDarkMode={false}
        isStreaming={true}
      />,
    )

    expect(container).toHaveTextContent('Hi')
    expect(container.querySelector('[style*="mask-image"]')).toBeNull()
  })
})
