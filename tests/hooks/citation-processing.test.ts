import { processCitationMarkers } from '@/components/chat/hooks/streaming-processor'
import type { WebSearchSource } from '@/components/chat/types'
import { describe, expect, it } from 'vitest'

describe('processCitationMarkers', () => {
  const sources: WebSearchSource[] = [
    { title: 'Example Page', url: 'https://example.com/page' },
    { title: 'Another Source', url: 'https://another.com/article' },
    { title: 'Third Source', url: 'https://third.com' },
  ]

  // ── Basic conversion ──────────────────────────────────────────────

  it('converts a single citation marker', () => {
    const input = 'Some fact【1】 and more text.'
    const result = processCitationMarkers(input, sources)
    expect(result).toBe(
      'Some fact[1](#cite-1~https://example.com/page~Example%20Page) and more text.',
    )
  })

  it('converts multiple citation markers', () => {
    const input = 'Fact one【1】 and fact two【2】.'
    const result = processCitationMarkers(input, sources)
    expect(result).toContain('[1](#cite-1~')
    expect(result).toContain('[2](#cite-2~')
  })

  it('converts citation with number 3', () => {
    const input = 'Info【3】.'
    const result = processCitationMarkers(input, sources)
    expect(result).toContain('[3](#cite-3~https://third.com~Third%20Source).')
  })

  it('handles adjacent citations without space', () => {
    const input = 'Fact【1】【2】.'
    const result = processCitationMarkers(input, sources)
    expect(result).toContain('[1](#cite-1~')
    expect(result).toContain('[2](#cite-2~')
  })

  it('handles three adjacent citations', () => {
    const input = 'Fact【1】【2】【3】.'
    const result = processCitationMarkers(input, sources)
    expect(result).toContain('[1](#cite-1~')
    expect(result).toContain('[2](#cite-2~')
    expect(result).toContain('[3](#cite-3~')
  })

  it('handles citation markers with extra text inside brackets', () => {
    const input = 'Fact【1†source】.'
    const result = processCitationMarkers(input, sources)
    expect(result).toContain('[1](#cite-1~')
    expect(result).toMatch(/Example%20Page\)\.$/)
  })

  it('handles citation markers with colon inside brackets', () => {
    const input = 'Fact【1:3†source】.'
    const result = processCitationMarkers(input, sources)
    expect(result).toContain('[1](#cite-1~')
    expect(result).toMatch(/Example%20Page\)\.$/)
  })

  it('produces correct format [num](#cite-num~url~title)', () => {
    const input = 'Fact【1】.'
    const result = processCitationMarkers(input, sources)
    const citationMatch = result.match(
      /\[(\d+)\]\(#cite-(\d+)~([^~]+)~([^)]+)\)/,
    )
    expect(citationMatch).not.toBeNull()
    expect(citationMatch![1]).toBe('1')
    expect(citationMatch![2]).toBe('1')
    expect(citationMatch![3]).toBe('https://example.com/page')
    expect(citationMatch![4]).toBe('Example%20Page')
  })

  // ── Trailing punctuation handling ─────────────────────────────────

  it('places trailing period after the citation', () => {
    const input = 'This is a fact【1】.'
    const result = processCitationMarkers(input, sources)
    expect(result).toBe(
      'This is a fact[1](#cite-1~https://example.com/page~Example%20Page).',
    )
  })

  it('places trailing comma after the citation', () => {
    const input = 'First point【1】, second point.'
    const result = processCitationMarkers(input, sources)
    expect(result).toMatch(/^First point\[1\]\(#cite-1~[^)]+\), second/)
  })

  it('places trailing semicolon after the citation', () => {
    const input = 'Statement【2】; more text.'
    const result = processCitationMarkers(input, sources)
    expect(result).toMatch(/^Statement\[2\]\(#cite-2~[^)]+\); more/)
  })

  it('places trailing colon after the citation', () => {
    const input = 'Key fact【1】: details follow.'
    const result = processCitationMarkers(input, sources)
    expect(result).toMatch(/^Key fact\[1\]\(#cite-1~[^)]+\): details/)
  })

  it('places trailing exclamation mark after the citation', () => {
    const input = 'Amazing【1】!'
    const result = processCitationMarkers(input, sources)
    expect(result).toMatch(/^Amazing\[1\]\(#cite-1~[^)]+\)!$/)
  })

  it('places trailing question mark after the citation', () => {
    const input = 'Is this true【1】?'
    const result = processCitationMarkers(input, sources)
    expect(result).toMatch(/^Is this true\[1\]\(#cite-1~[^)]+\)\?$/)
  })

  it('places CJK period after the citation', () => {
    const input = 'Some text【1】。More text.'
    const result = processCitationMarkers(input, sources)
    expect(result).toContain('Example%20Page)。More')
  })

  it('places CJK comma after the citation', () => {
    const input = 'Some text【1】，more text.'
    const result = processCitationMarkers(input, sources)
    expect(result).toContain('Example%20Page)，more')
  })

  it('places CJK exclamation after the citation', () => {
    const input = 'Wow【1】！'
    const result = processCitationMarkers(input, sources)
    expect(result).toMatch(/Example%20Page\)！$/)
  })

  it('places CJK question mark after the citation', () => {
    const input = 'Really【1】？'
    const result = processCitationMarkers(input, sources)
    expect(result).toMatch(/Example%20Page\)？$/)
  })

  it('handles no trailing punctuation', () => {
    const input = 'Some text【1】 more text.'
    const result = processCitationMarkers(input, sources)
    expect(result).toContain('Some text[1](#cite-1~')
    expect(result).toContain(') more text.')
  })

  it('only captures one punctuation character, not two', () => {
    const input = 'Fact【1】..'
    const result = processCitationMarkers(input, sources)
    expect(result).toMatch(/Example%20Page\)\.\.$/)
  })

  // ── Adjacent citations with punctuation (the bug fix) ─────────────

  it('places period after all adjacent citations, not between them', () => {
    const input = 'Fact【1】【2】.'
    const result = processCitationMarkers(input, sources)
    // Period should come after the last citation, not between them
    expect(result).toMatch(/\[1\]\(#cite-1~[^)]+\)\[2\]\(#cite-2~[^)]+\)\./)
    // Should NOT have period between citations
    expect(result).not.toMatch(/\)\.\[/)
  })

  it('places period after three adjacent citations', () => {
    const input = 'Fact【1】【2】【3】.'
    const result = processCitationMarkers(input, sources)
    // Period after last citation only
    expect(result).toMatch(/Third%20Source\)\./)
    // No period between any citations
    expect(result).not.toMatch(/\)\.\[/)
  })

  it('handles adjacent citations with comma after last', () => {
    const input = 'Thing【1】【2】, and more.'
    const result = processCitationMarkers(input, sources)
    expect(result).toMatch(/Another%20Source\), and/)
    expect(result).not.toMatch(/\),\[/)
  })

  it('handles period between non-adjacent citations correctly', () => {
    const input = 'First fact【1】. Second fact【2】.'
    const result = processCitationMarkers(input, sources)
    expect(result).toContain('Example%20Page).')
    expect(result).toContain('Another%20Source).')
  })

  // ── URL encoding ──────────────────────────────────────────────────

  it('encodes parentheses in URLs', () => {
    const src: WebSearchSource[] = [
      { title: 'Wiki', url: 'https://en.wikipedia.org/wiki/Foo_(bar)' },
    ]
    const result = processCitationMarkers('Content【1】.', src)
    expect(result).toContain('https://en.wikipedia.org/wiki/Foo_%28bar%29')
    expect(result).not.toContain('Foo_(bar)')
  })

  it('encodes multiple parentheses pairs in URLs', () => {
    const src: WebSearchSource[] = [
      { title: 'Page', url: 'https://example.com/a(b)(c)' },
    ]
    const result = processCitationMarkers('Text【1】.', src)
    expect(result).toContain('a%28b%29%28c%29')
  })

  it('encodes pipes in URLs', () => {
    const src: WebSearchSource[] = [
      { title: 'Page', url: 'https://example.com/a|b' },
    ]
    const result = processCitationMarkers('Text【1】.', src)
    expect(result).toContain('https://example.com/a%7Cb')
  })

  it('does not double-encode already percent-encoded URLs', () => {
    const src: WebSearchSource[] = [
      { title: 'Page', url: 'https://example.com/foo%20bar' },
    ]
    const result = processCitationMarkers('Text【1】.', src)
    expect(result).toContain('https://example.com/foo%20bar')
  })

  it('preserves URL query parameters', () => {
    const src: WebSearchSource[] = [
      { title: 'Search', url: 'https://example.com/search?q=test&page=1' },
    ]
    const result = processCitationMarkers('Text【1】.', src)
    expect(result).toContain('https://example.com/search?q=test&page=1')
  })

  it('preserves URL fragments', () => {
    const src: WebSearchSource[] = [
      { title: 'Section', url: 'https://example.com/page#section-2' },
    ]
    const result = processCitationMarkers('Text【1】.', src)
    expect(result).toContain('https://example.com/page#section-2')
  })

  it('handles URLs with tildes (delimiter character)', () => {
    const src: WebSearchSource[] = [
      { title: 'User Page', url: 'https://example.com/~user/page' },
    ]
    const result = processCitationMarkers('Content【1】.', src)
    expect(result).toContain('%7Euser/page')
    expect(result).not.toContain('~user/page')
  })

  it('handles very long URLs', () => {
    const longPath = 'a'.repeat(500)
    const src: WebSearchSource[] = [
      { title: 'Long', url: `https://example.com/${longPath}` },
    ]
    const result = processCitationMarkers('Text【1】.', src)
    expect(result).toContain(longPath)
  })

  // ── Title encoding ────────────────────────────────────────────────

  it('encodes parentheses in titles', () => {
    const src: WebSearchSource[] = [
      { title: 'Side effects (NHS)', url: 'https://nhs.uk/finasteride' },
    ]
    const result = processCitationMarkers('Info【1】.', src)
    expect(result).toContain('Side%20effects%20%28NHS%29')
    expect(result).not.toContain('(NHS)')
  })

  it('encodes nested parentheses in titles', () => {
    const src: WebSearchSource[] = [
      { title: 'Drug info (generic (brand))', url: 'https://example.com' },
    ]
    const result = processCitationMarkers('Details【1】.', src)
    expect(result).not.toContain('(generic')
    expect(result).not.toContain('(brand)')
    expect(result).toContain('%28generic')
    expect(result).toContain('%28brand%29%29')
  })

  it('encodes special characters in titles', () => {
    const src: WebSearchSource[] = [
      { title: 'A & B: "test" <value>', url: 'https://example.com' },
    ]
    const result = processCitationMarkers('Text【1】.', src)
    expect(result).toContain('%26')
    expect(result).toContain('%3C')
    expect(result).toContain('%3E')
  })

  it('encodes tildes in titles', () => {
    const src: WebSearchSource[] = [
      { title: 'Approx ~100 items', url: 'https://example.com' },
    ]
    const result = processCitationMarkers('Text【1】.', src)
    expect(result).toContain('%7E100')
    expect(result).not.toContain('~100')
  })

  it('handles empty title', () => {
    const src: WebSearchSource[] = [{ title: '', url: 'https://example.com' }]
    const result = processCitationMarkers('Text【1】.', src)
    expect(result).toContain('#cite-1~https://example.com~)')
  })

  it('handles title with unicode characters', () => {
    const src: WebSearchSource[] = [
      { title: 'Über die Wirkung — eine Übersicht', url: 'https://example.de' },
    ]
    const result = processCitationMarkers('Text【1】.', src)
    expect(result).toContain('#cite-1~https://example.de~')
  })

  it('handles title with markdown special chars', () => {
    const src: WebSearchSource[] = [
      { title: 'Guide: [Part 1] *important*', url: 'https://example.com' },
    ]
    const result = processCitationMarkers('Text【1】.', src)
    expect(result).toContain('%5BPart%201%5D')
  })

  // ── Edge cases and boundary conditions ────────────────────────────

  it('returns content unchanged when sources are empty', () => {
    const input = 'Text with【1】citation.'
    expect(processCitationMarkers(input, [])).toBe(input)
  })

  it('returns content unchanged when no citation markers present', () => {
    const input = 'Just regular text with no citations.'
    expect(processCitationMarkers(input, sources)).toBe(input)
  })

  it('leaves marker unchanged when source index is out of bounds', () => {
    const input = 'Text【5】more.'
    expect(processCitationMarkers(input, sources)).toBe(input)
  })

  it('leaves marker unchanged for index 0', () => {
    const input = 'Text【0】more.'
    expect(processCitationMarkers(input, sources)).toBe(input)
  })

  it('handles mix of valid and out-of-bounds citations', () => {
    const input = 'Valid【1】. Invalid【99】. Also valid【2】.'
    const result = processCitationMarkers(input, sources)
    expect(result).toContain('[1](#cite-1~')
    expect(result).toContain('【99】')
    expect(result).toContain('[2](#cite-2~')
  })

  it('handles citation at the very start of text', () => {
    const input = '【1】 is the first thing.'
    const result = processCitationMarkers(input, sources)
    expect(result).toMatch(/^\[1\]\(#cite-1~/)
  })

  it('handles citation at the very end of text with no punctuation', () => {
    const input = 'The source is【1】'
    const result = processCitationMarkers(input, sources)
    expect(result).toMatch(/Example%20Page\)$/)
  })

  it('handles input that is only a citation marker', () => {
    const input = '【1】'
    const result = processCitationMarkers(input, sources)
    expect(result).toBe('[1](#cite-1~https://example.com/page~Example%20Page)')
  })

  it('handles empty input string', () => {
    expect(processCitationMarkers('', sources)).toBe('')
  })

  it('handles double-digit citation numbers', () => {
    const manySources = Array.from({ length: 12 }, (_, i) => ({
      title: `Source ${i + 1}`,
      url: `https://example.com/${i + 1}`,
    }))
    const input = 'Fact【12】.'
    const result = processCitationMarkers(input, manySources)
    expect(result).toContain(
      '[12](#cite-12~https://example.com/12~Source%2012).',
    )
  })

  // ── Real-world bug scenarios ──────────────────────────────────────

  it('handles citation after closing parenthesis in surrounding text', () => {
    const src: WebSearchSource[] = [
      {
        title: 'Side effects of finasteride - NHS',
        url: 'https://nhs.uk/medicines/finasteride/side-effects',
      },
    ]
    const input =
      'problems (notably reduced semen volume or "dry" orgasms)【1】.'
    const result = processCitationMarkers(input, src)
    expect(result).toBe(
      'problems (notably reduced semen volume or "dry" orgasms)[1](#cite-1~https://nhs.uk/medicines/finasteride/side-effects~Side%20effects%20of%20finasteride%20-%20NHS).',
    )
  })

  it('handles citation between parenthesized text blocks', () => {
    const input = 'Effect (type A)【1】 and (type B)【2】.'
    const result = processCitationMarkers(input, sources)
    expect(result).toContain('(type A)[1](#cite-1~')
    expect(result).toContain('(type B)[2](#cite-2~')
    expect(result).toMatch(/Another%20Source\)\.$/)
  })

  it('handles citation with both URL parens and text parens', () => {
    const src: WebSearchSource[] = [
      {
        title: 'Finasteride (drug)',
        url: 'https://en.wikipedia.org/wiki/Finasteride_(medication)',
      },
    ]
    const input = 'decreased libido (common)【1】.'
    const result = processCitationMarkers(input, src)
    // URL parens encoded
    expect(result).toContain('Finasteride_%28medication%29')
    // Title parens encoded
    expect(result).toContain('Finasteride%20%28drug%29')
    // Text parens preserved
    expect(result).toContain('(common)')
  })

  // ── Markdown context preservation ─────────────────────────────────

  it('preserves surrounding bold markdown', () => {
    const input = '**Bold text**【1】. Regular text.'
    const result = processCitationMarkers(input, sources)
    expect(result).toContain('**Bold text**[1](#cite-1~')
    expect(result).toContain('Example%20Page). Regular')
  })

  it('preserves surrounding italic markdown', () => {
    const input = '*Italic text*【1】.'
    const result = processCitationMarkers(input, sources)
    expect(result).toContain('*Italic text*[1](#cite-1~')
    expect(result).toMatch(/Example%20Page\)\.$/)
  })

  it('preserves list item context', () => {
    const input = '- Item one【1】.\n- Item two【2】.'
    const result = processCitationMarkers(input, sources)
    expect(result).toContain('- Item one[1](#cite-1~')
    expect(result).toContain('- Item two[2](#cite-2~')
  })

  it('preserves newlines around citations', () => {
    const input = 'Paragraph one【1】.\n\nParagraph two【2】.'
    const result = processCitationMarkers(input, sources)
    expect(result).toContain('Example%20Page).\n\nParagraph two')
  })

  it('handles citation inside a markdown link context', () => {
    const input = 'See [this article](https://example.com)【1】.'
    const result = processCitationMarkers(input, sources)
    expect(result).toContain('(https://example.com)[1](#cite-1~')
    expect(result).toMatch(/Example%20Page\)\.$/)
  })
})
