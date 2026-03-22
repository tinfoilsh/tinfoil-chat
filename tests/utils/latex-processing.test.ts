import {
  isUnsupportedLatex,
  processLatexTags,
  sanitizeUnsupportedMathBlocks,
} from '@/utils/latex-processing'
import { describe, expect, it } from 'vitest'

describe('latex-processing', () => {
  describe('isUnsupportedLatex', () => {
    describe('should return true for document-level LaTeX', () => {
      it.each([
        '\\usepackage{amsmath}',
        '\\documentclass{article}',
        '\\section{Introduction}',
        '\\chapter{One}',
        '\\item First item',
        '\\caption{Figure 1}',
        '\\label{eq:1}',
        '\\ref{eq:1}',
        '\\cite{paper}',
        '\\bibliography{refs}',
        '\\centering',
      ])('returns true for: %s', (content) => {
        expect(isUnsupportedLatex(content)).toBe(true)
      })
    })

    describe('should return false for supported math', () => {
      it('accepts basic math expressions', () => {
        expect(isUnsupportedLatex('x^2 + y^2 = z^2')).toBe(false)
      })

      it('accepts fractions', () => {
        expect(isUnsupportedLatex('\\frac{a}{b}')).toBe(false)
      })

      it('accepts square roots', () => {
        expect(isUnsupportedLatex('\\sqrt{x}')).toBe(false)
      })

      it('accepts matrix environment', () => {
        expect(
          isUnsupportedLatex('\\begin{matrix} a & b \\\\ c & d \\end{matrix}'),
        ).toBe(false)
      })

      it('accepts pmatrix environment', () => {
        expect(
          isUnsupportedLatex(
            '\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}',
          ),
        ).toBe(false)
      })

      it('accepts bmatrix environment', () => {
        expect(
          isUnsupportedLatex('\\begin{bmatrix} a \\\\ b \\end{bmatrix}'),
        ).toBe(false)
      })

      it('accepts cases environment', () => {
        expect(
          isUnsupportedLatex(
            '\\begin{cases} x & \\text{if } y > 0 \\\\ -x & \\text{otherwise} \\end{cases}',
          ),
        ).toBe(false)
      })

      it('accepts aligned environment', () => {
        expect(
          isUnsupportedLatex(
            '\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}',
          ),
        ).toBe(false)
      })

      it('accepts array environment', () => {
        expect(
          isUnsupportedLatex(
            '\\begin{array}{cc} a & b \\\\ c & d \\end{array}',
          ),
        ).toBe(false)
      })
    })

    describe('should return true for unsupported environments', () => {
      it('rejects figure environment', () => {
        expect(
          isUnsupportedLatex('\\begin{figure} content \\end{figure}'),
        ).toBe(true)
      })

      it('rejects table environment', () => {
        expect(isUnsupportedLatex('\\begin{table} content \\end{table}')).toBe(
          true,
        )
      })

      it('rejects itemize environment', () => {
        expect(
          isUnsupportedLatex('\\begin{itemize} \\item one \\end{itemize}'),
        ).toBe(true)
      })
    })
  })

  describe('processLatexTags', () => {
    describe('display math conversion', () => {
      it('converts \\[...\\] to $$...$$', () => {
        const input = 'Here is an equation: \\[x^2 + y^2 = z^2\\]'
        const result = processLatexTags(input)
        expect(result).toContain('$$')
        expect(result).toContain('x^2 + y^2 = z^2')
        expect(result).not.toContain('\\[')
        expect(result).not.toContain('\\]')
      })

      it('handles multiple display math blocks', () => {
        const input = '\\[a = b\\] and \\[c = d\\]'
        const result = processLatexTags(input)
        expect(result.match(/\$\$/g)?.length).toBe(4) // 2 blocks × 2 delimiters
      })
    })

    describe('inline math conversion', () => {
      it('converts \\(...\\) to $$...$$', () => {
        const input = 'The value \\(x\\) is positive'
        const result = processLatexTags(input)
        expect(result).toBe('The value $$x$$ is positive')
      })

      it('handles multiple inline math', () => {
        const input = 'Given \\(a\\) and \\(b\\), find \\(c\\)'
        const result = processLatexTags(input)
        expect(result).toBe('Given $$a$$ and $$b$$, find $$c$$')
      })
    })

    describe('code block preservation', () => {
      it('preserves triple backtick code blocks', () => {
        const input = '```\n\\[x\\]\n```'
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      it('preserves tilde code blocks', () => {
        const input = '~~~\n\\[x\\]\n~~~'
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      it('preserves inline code', () => {
        const input = 'Use `\\[x\\]` for math'
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      it('processes math outside code blocks while preserving code', () => {
        const input = '\\[a\\] then ```\\[b\\]``` then \\[c\\]'
        const result = processLatexTags(input)
        expect(result).toContain('$$')
        expect(result).toContain('```\\[b\\]```')
      })
    })

    describe('single-dollar LaTeX conversion', () => {
      // --- The core bug fix: $\$AMOUNT$ patterns ---

      it('converts $\\$10,000$ to $$\\$10,000$$', () => {
        const input = 'invested $\\$10,000$ in stocks'
        const result = processLatexTags(input)
        expect(result).toBe('invested $$\\$10,000$$ in stocks')
      })

      it('converts multiple $\\$AMOUNT$ in the same sentence', () => {
        const input =
          '$\\$10,000$ invested would have grown to approximately $\\$35,000$ today.'
        const result = processLatexTags(input)
        expect(result).toBe(
          '$$\\$10,000$$ invested would have grown to approximately $$\\$35,000$$ today.',
        )
      })

      it('converts $\\$AMOUNT$ with decimals', () => {
        const input = 'The price is $\\$19.99$ per unit'
        const result = processLatexTags(input)
        expect(result).toBe('The price is $$\\$19.99$$ per unit')
      })

      it('converts $\\$AMOUNT$ with large numbers and commas', () => {
        const input = 'Revenue reached $\\$1,234,567.89$'
        const result = processLatexTags(input)
        expect(result).toBe('Revenue reached $$\\$1,234,567.89$$')
      })

      it('handles the exact bug report markdown', () => {
        const input =
          'To put that in dollar terms: $\\$10,000$ invested in the index a decade ago—with dividends reinvested—would have grown to approximately $\\$35,000$ today.'
        const result = processLatexTags(input)
        expect(result).toContain('$$\\$10,000$$')
        expect(result).toContain('$$\\$35,000$$')
        expect(result).not.toMatch(/[^$]\$\\/)
      })

      // --- Standard LaTeX math in single-dollar delimiters ---

      it('converts $\\frac{a}{b}$ to $$\\frac{a}{b}$$', () => {
        const input = 'The ratio is $\\frac{a}{b}$ exactly'
        const result = processLatexTags(input)
        expect(result).toBe('The ratio is $$\\frac{a}{b}$$ exactly')
      })

      it('converts $\\sqrt{x}$ to $$\\sqrt{x}$$', () => {
        const input = 'Compute $\\sqrt{x}$'
        const result = processLatexTags(input)
        expect(result).toBe('Compute $$\\sqrt{x}$$')
      })

      it('converts $\\alpha + \\beta$ to $$\\alpha + \\beta$$', () => {
        const input = 'where $\\alpha + \\beta$ equals 1'
        const result = processLatexTags(input)
        expect(result).toBe('where $$\\alpha + \\beta$$ equals 1')
      })

      it('converts $\\text{something}$ to $$\\text{something}$$', () => {
        const input = 'the value $\\text{max}$ is used'
        const result = processLatexTags(input)
        expect(result).toBe('the value $$\\text{max}$$ is used')
      })

      it('converts $\\sum_{i=1}^{n} x_i$ with LaTeX commands', () => {
        const input = 'The sum $\\sum_{i=1}^{n} x_i$ converges'
        const result = processLatexTags(input)
        expect(result).toBe('The sum $$\\sum_{i=1}^{n} x_i$$ converges')
      })

      it('converts $\\int_0^1 f(x) dx$ with integral', () => {
        const input = 'Evaluate $\\int_0^1 f(x) dx$'
        const result = processLatexTags(input)
        expect(result).toBe('Evaluate $$\\int_0^1 f(x) dx$$')
      })

      it('converts $\\mathbb{R}$ with math font commands', () => {
        const input = 'over the reals $\\mathbb{R}$'
        const result = processLatexTags(input)
        expect(result).toBe('over the reals $$\\mathbb{R}$$')
      })

      it('converts $\\lim_{n \\to \\infty}$ with limit notation', () => {
        const input = 'as $\\lim_{n \\to \\infty} a_n$ approaches 0'
        const result = processLatexTags(input)
        expect(result).toBe('as $$\\lim_{n \\to \\infty} a_n$$ approaches 0')
      })

      // --- Currency dollar signs that should NOT be converted ---

      it('does not convert plain $10,000 (no closing dollar)', () => {
        const input = 'The cost is $10,000 for the project'
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      it('does not convert $100 without closing dollar', () => {
        const input = 'It costs $100 per month'
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      it('does not convert multiple currency amounts without LaTeX', () => {
        const input = 'Prices range from $10 to $50, with premium at $100 each'
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      it('does not convert "between $10 and $15" as math', () => {
        const input = 'between $10 and $15'
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      it('does not convert "from $10 to $20 per share"', () => {
        const input = 'the stock went from $10 to $20 per share'
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      it('does not convert "$500 and $1,000 deposits"', () => {
        const input = 'We accept $500 and $1,000 deposits'
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      it('converts $10$ as math', () => {
        const input = 'The value $10$ is small'
        const result = processLatexTags(input)
        expect(result).toBe('The value $$10$$ is small')
      })

      it('converts $5,000$ as math', () => {
        const input = 'approximately $5,000$ people attended'
        const result = processLatexTags(input)
        expect(result).toBe('approximately $$5,000$$ people attended')
      })

      it('converts $x$ as math', () => {
        const input = 'the variable $x$ is used'
        const result = processLatexTags(input)
        expect(result).toBe('the variable $$x$$ is used')
      })

      it('converts $abc$ as math', () => {
        const input = 'the string $abc$ is interesting'
        const result = processLatexTags(input)
        expect(result).toBe('the string $$abc$$ is interesting')
      })

      it('converts $x^2 + y^2$ as math (no backslash commands)', () => {
        const input = 'the equation $x^2 + y^2$ is familiar'
        const result = processLatexTags(input)
        expect(result).toBe('the equation $$x^2 + y^2$$ is familiar')
      })

      // --- Dollar signs at sentence boundaries ---

      it('does not convert $ at end of sentence without opening', () => {
        const input = 'This costs 500$'
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      it('handles $ followed by space (not valid opening)', () => {
        const input = 'We spent $ 100 on supplies'
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      // --- Interaction with existing $$ blocks ---

      it('does not mangle existing $$...$$ display math', () => {
        const input = 'Display math: $$x^2 + y^2 = z^2$$'
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      it('does not mangle $$...$$ blocks that came from \\(...\\) conversion', () => {
        const input = 'inline \\(x^2\\) and display \\[y^2\\]'
        const result = processLatexTags(input)
        expect(result).toContain('$$x^2$$')
        expect(result).toContain('$$\ny^2\n$$')
      })

      it('handles $\\$...$ adjacent to $$...$$ blocks', () => {
        const input = '$$E = mc^2$$ and the cost is $\\$500$'
        const result = processLatexTags(input)
        expect(result).toContain('$$E = mc^2$$')
        expect(result).toContain('$$\\$500$$')
      })

      it('handles $\\$...$ adjacent to \\(...\\) converted blocks', () => {
        const input = '\\(E = mc^2\\) and the cost is $\\$500$'
        const result = processLatexTags(input)
        expect(result).toContain('$$E = mc^2$$')
        expect(result).toContain('$$\\$500$$')
      })

      // --- Code block preservation with single-dollar ---

      it('does not convert $\\$...$ inside inline code', () => {
        const input = 'Use `$\\$10$` for dollar amounts'
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      it('does not convert $\\$...$ inside fenced code blocks', () => {
        const input = '```\n$\\$10,000$\n```'
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      it('converts $\\$...$ outside code but preserves inside', () => {
        const input = 'Cost is $\\$100$ and code: `$\\$200$`'
        const result = processLatexTags(input)
        expect(result).toBe('Cost is $$\\$100$$ and code: `$\\$200$`')
      })

      // --- Escaped dollar signs ---

      it('does not treat \\$ as opening delimiter', () => {
        const input = 'The price is \\$100'
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      // --- Multiple LaTeX expressions in same paragraph ---

      it('handles mix of \\(...\\) and $\\$...$ in same text', () => {
        const input = 'The formula \\(E = mc^2\\) shows that $\\$1M$ is needed'
        const result = processLatexTags(input)
        expect(result).toContain('$$E = mc^2$$')
        expect(result).toContain('$$\\$1M$$')
      })

      it('handles multiple $\\$...$ with regular text between', () => {
        const input = 'From $\\$100$ to $\\$200$ is a $\\$100$ increase'
        const result = processLatexTags(input)
        expect(result).toBe(
          'From $$\\$100$$ to $$\\$200$$ is a $$\\$100$$ increase',
        )
      })

      // --- Edge cases for the closing delimiter ---

      it('does not match if closing $ is preceded by space', () => {
        const input = '$\\$100 $ extra'
        const result = processLatexTags(input)
        // Space before closing $ makes it invalid — should not convert
        expect(result).toBe(input)
      })

      it('does not match if opening $ is followed by space', () => {
        const input = '$ \\$100$ extra'
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      // --- Real-world model outputs ---

      it('handles model output with LaTeX dollar in running text', () => {
        const input =
          'The stock dropped from $\\$150$ to $\\$120$, a loss of $\\$30$ per share.'
        const result = processLatexTags(input)
        expect(result).toBe(
          'The stock dropped from $$\\$150$$ to $$\\$120$$, a loss of $$\\$30$$ per share.',
        )
      })

      it('handles model output with mixed LaTeX and plain currency', () => {
        const input =
          'Revenue was $500M last year. The formula is $\\frac{revenue}{shares}$.'
        const result = processLatexTags(input)
        // $500M has no closing $ pair, stays as-is
        // $\\frac{...}$ has LaTeX commands, gets converted
        expect(result).toContain('$500M')
        expect(result).toContain('$$\\frac{revenue}{shares}$$')
      })

      it('handles model output with \\(...\\) and $\\$...$', () => {
        const input =
          'Given \\(P = \\$10,000\\) and a rate of \\(r = 0.05\\), the future value is $\\$12,500$.'
        const result = processLatexTags(input)
        expect(result).toContain('$$P = \\$10,000$$')
        expect(result).toContain('$$r = 0.05$$')
        expect(result).toContain('$$\\$12,500$$')
      })

      it('handles model using $\\times$ for multiplication', () => {
        const input = 'the result is $3 \\times 4$'
        const result = processLatexTags(input)
        expect(result).toBe('the result is $$3 \\times 4$$')
      })

      it('handles model using $\\approx$ for approximation', () => {
        const input = 'roughly $\\approx 42$'
        const result = processLatexTags(input)
        expect(result).toBe('roughly $$\\approx 42$$')
      })

      it('handles model using $\\pm$ for plus-minus', () => {
        const input = 'the value is $10 \\pm 2$'
        const result = processLatexTags(input)
        expect(result).toBe('the value is $$10 \\pm 2$$')
      })

      it('handles $\\le$ and $\\ge$ comparisons', () => {
        const input = 'when $x \\le 10$ and $y \\ge 5$'
        const result = processLatexTags(input)
        expect(result).toBe('when $$x \\le 10$$ and $$y \\ge 5$$')
      })

      it('handles $\\$0$ edge case (zero dollars)', () => {
        const input = 'starting from $\\$0$ to $\\$1M$'
        const result = processLatexTags(input)
        expect(result).toBe('starting from $$\\$0$$ to $$\\$1M$$')
      })

      it('handles $\\$...$ with K/M/B suffixes', () => {
        const input = 'raised $\\$50M$ in funding'
        const result = processLatexTags(input)
        expect(result).toBe('raised $$\\$50M$$ in funding')
      })

      it('handles $\\$...$ with negative amounts', () => {
        const input = 'lost $\\$-500$ on the trade'
        const result = processLatexTags(input)
        expect(result).toBe('lost $$\\$-500$$ on the trade')
      })

      // --- Dollar signs inside markdown link URLs ---

      it('does not match $ inside a markdown link URL', () => {
        const input =
          "sold roughly $4.1M of common stock during the company's Series A[2](#cite-2~https://example.com/sells-$4.1m-stock~Title), though such transactions are unusual."
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      it('does not match $ across multiple markdown link URLs', () => {
        const input =
          '**$10M+ ARR and a nine-figure valuation**[6](#cite-6~https://example.com/sell-stock/~Title)[4](#cite-4~https://example.com/$guide~Guide). If the valuation is north of $80–100M, most firms will accommodate.'
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      it('preserves math inside link text while skipping URL dollars', () => {
        const input = 'See [$x > 0$](https://example.com/$path) for details'
        const result = processLatexTags(input)
        expect(result).toBe(
          'See [$$x > 0$$](https://example.com/$path) for details',
        )
      })

      it('does not match currency $ with closer inside URL', () => {
        const input =
          'raised $50M in funding[1](#cite~https://example.com/raises-$50m~Title) last year'
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      it('handles $ in URL-encoded text within links', () => {
        const input =
          'costs $100 per unit[3](#cite~https://example.com/~Product%20costs%20$100%20per%20unit) in bulk'
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      it('handles multiple citations with $ in URLs after currency', () => {
        const input =
          'The price is $500 and $1,000[1](#cite~url/$500)[2](#cite~url/$1000). End.'
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      it('still converts valid $\\$...$ when links are present', () => {
        const input =
          'Cost is $\\$100$ per unit[1](#cite~https://example.com/price).'
        const result = processLatexTags(input)
        expect(result).toContain('$$\\$100$$')
        expect(result).toContain('](#cite~https://example.com/price)')
      })

      it('handles links with nested parentheses in URL', () => {
        const input =
          'See $x$[1](#cite~https://example.com/path_(section)) for info'
        const result = processLatexTags(input)
        expect(result).toContain('$$x$$')
        expect(result).toContain('(#cite~https://example.com/path_(section))')
      })
    })

    describe('edge cases', () => {
      it('handles empty string', () => {
        expect(processLatexTags('')).toBe('')
      })

      it('handles text without LaTeX', () => {
        const input = 'Just plain text'
        expect(processLatexTags(input)).toBe(input)
      })

      it('handles unclosed display math', () => {
        const input = 'Start \\[x but no close'
        const result = processLatexTags(input)
        // Should not crash, delimiter stays as-is
        expect(result).toContain('\\[')
      })

      it('handles single $ at end of string', () => {
        const input = 'costs $'
        const result = processLatexTags(input)
        expect(result).toBe(input)
      })

      it('handles consecutive dollar signs $$$', () => {
        const input = 'text $$$ more text'
        const result = processLatexTags(input)
        // Should not crash
        expect(result).toContain('text')
        expect(result).toContain('more text')
      })

      it('handles $\\$$ with no content after escaped dollar', () => {
        const input = 'the value $\\$$'
        const result = processLatexTags(input)
        expect(result).toBe('the value $$\\$$$')
      })

      it('handles line breaks around dollar signs', () => {
        const input = 'cost is\n$\\$100$\nper unit'
        const result = processLatexTags(input)
        expect(result).toContain('$$\\$100$$')
      })
    })
  })

  describe('sanitizeUnsupportedMathBlocks', () => {
    it('removes \\label commands', () => {
      const input = '$$x^2 \\label{eq:1}$$'
      const result = sanitizeUnsupportedMathBlocks(input)
      expect(result).toBe('$$x^2 $$')
    })

    it('replaces \\omicron with o', () => {
      const input = '$$\\omicron$$'
      const result = sanitizeUnsupportedMathBlocks(input)
      expect(result).toBe('$$o$$')
    })

    it('removes \\circled command but keeps content', () => {
      const input = '$$\\circled{1}$$'
      const result = sanitizeUnsupportedMathBlocks(input)
      expect(result).toBe('$$1$$')
    })

    it('replaces \\mathscr with \\mathcal', () => {
      const input = '$$\\mathscr{L}$$'
      const result = sanitizeUnsupportedMathBlocks(input)
      expect(result).toBe('$$\\mathcal{L}$$')
    })

    it('preserves code blocks', () => {
      const input = '```\n$$\\label{x}$$\n```'
      const result = sanitizeUnsupportedMathBlocks(input)
      expect(result).toBe(input)
    })

    it('handles multiple math blocks', () => {
      const input = '$$\\omicron_1$$ text $$\\omicron_2$$'
      const result = sanitizeUnsupportedMathBlocks(input)
      expect(result).toBe('$$o_1$$ text $$o_2$$')
    })
  })
})
