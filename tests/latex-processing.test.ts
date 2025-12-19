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
