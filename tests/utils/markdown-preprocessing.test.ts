import {
  indentCodeBlocksInLists,
  preprocessMarkdown,
} from '@/utils/markdown-preprocessing'
import { describe, expect, it } from 'vitest'

describe('markdown-preprocessing', () => {
  describe('preprocessMarkdown', () => {
    describe('HTML to markdown conversion', () => {
      it('converts <a> tags to markdown links', () => {
        const input = '<a href="https://example.com">Example</a>'
        expect(preprocessMarkdown(input)).toBe('[Example](https://example.com)')
      })

      it('uses URL as text when <a> tag has empty text', () => {
        const input = '<a href="https://example.com"></a>'
        expect(preprocessMarkdown(input)).toBe(
          '[https://example.com](https://example.com)',
        )
      })

      it('converts <b> tags to bold markdown', () => {
        expect(preprocessMarkdown('<b>bold text</b>')).toBe('**bold text**')
      })

      it('converts <strong> tags to bold markdown', () => {
        expect(preprocessMarkdown('<strong>bold text</strong>')).toBe(
          '**bold text**',
        )
      })

      it('converts multiple HTML tags in one string', () => {
        const input =
          'Click <a href="https://x.com">here</a> for <b>details</b>'
        expect(preprocessMarkdown(input)).toBe(
          'Click [here](https://x.com) for **details**',
        )
      })
    })

    describe('code block preservation', () => {
      it('preserves HTML inside fenced code blocks', () => {
        const input = '```html\n<a href="url">link</a>\n```'
        expect(preprocessMarkdown(input)).toBe(input)
      })

      it('preserves HTML inside inline code', () => {
        const input = 'Use `<b>bold</b>` for emphasis'
        expect(preprocessMarkdown(input)).toBe(input)
      })

      it('converts HTML outside code blocks while preserving code', () => {
        const input = '<b>bold</b>\n```\n<b>not bold</b>\n```\n<b>bold</b>'
        const result = preprocessMarkdown(input)
        expect(result).toBe('**bold**\n```\n<b>not bold</b>\n```\n**bold**')
      })
    })

    describe('pass-through behavior', () => {
      it('returns plain text unchanged', () => {
        const input = 'Just some plain text without any special formatting'
        expect(preprocessMarkdown(input)).toBe(input)
      })

      it('returns empty string unchanged', () => {
        expect(preprocessMarkdown('')).toBe('')
      })

      it('preserves existing markdown formatting', () => {
        const input = '**bold** and *italic* and [link](url)'
        expect(preprocessMarkdown(input)).toBe(input)
      })
    })

    describe('integration with indentCodeBlocksInLists', () => {
      it('indents code blocks in lists AND converts HTML', () => {
        const input =
          '1. <b>Step one</b>:\n```bash\necho hello\n```\n2. Step two'
        const result = preprocessMarkdown(input)
        expect(result).toContain('**Step one**')
        // The code block should be indented inside the list item
        expect(result).toMatch(/^\s+```bash/m)
      })
    })
  })

  describe('indentCodeBlocksInLists', () => {
    describe('ordered lists', () => {
      it('indents unindented code fence in ordered list', () => {
        const input = [
          '1. Check this:',
          '```bash',
          'echo hello',
          '```',
          '2. Next step',
        ].join('\n')
        const result = indentCodeBlocksInLists(input)
        const lines = result.split('\n')
        // "1. " is 3 chars, so content indent is 3
        expect(lines[1]).toBe('   ```bash')
        expect(lines[2]).toBe('   echo hello')
        expect(lines[3]).toBe('   ```')
      })

      it('indents code fence in list with wider marker', () => {
        // "1.  " (with extra space) = 4 chars content indent
        const input = [
          '1.  Check this:',
          '```bash',
          'grep microcode /proc/cpuinfo | sort | uniq',
          '```',
        ].join('\n')
        const result = indentCodeBlocksInLists(input)
        const lines = result.split('\n')
        expect(lines[1]).toBe('    ```bash')
        expect(lines[2]).toBe('    grep microcode /proc/cpuinfo | sort | uniq')
        expect(lines[3]).toBe('    ```')
      })

      it('handles double-digit list numbers', () => {
        const input = ['10. Step ten:', '```', 'code here', '```'].join('\n')
        const result = indentCodeBlocksInLists(input)
        // "10. " = 4 chars
        expect(result.split('\n')[1]).toBe('    ```')
      })

      it('does not modify already properly indented code fences', () => {
        const input = [
          '1. Check this:',
          '   ```bash',
          '   echo hello',
          '   ```',
        ].join('\n')
        expect(indentCodeBlocksInLists(input)).toBe(input)
      })
    })

    describe('unordered lists', () => {
      it('indents code fence in dash list', () => {
        const input = ['- Step one:', '```python', 'print("hi")', '```'].join(
          '\n',
        )
        const result = indentCodeBlocksInLists(input)
        // "- " = 2 chars
        expect(result.split('\n')[1]).toBe('  ```python')
        expect(result.split('\n')[2]).toBe('  print("hi")')
        expect(result.split('\n')[3]).toBe('  ```')
      })

      it('indents code fence in asterisk list', () => {
        const input = ['* Step one:', '```', 'code', '```'].join('\n')
        const result = indentCodeBlocksInLists(input)
        expect(result.split('\n')[1]).toBe('  ```')
      })

      it('indents code fence in plus list', () => {
        const input = ['+ Step one:', '```', 'code', '```'].join('\n')
        const result = indentCodeBlocksInLists(input)
        expect(result.split('\n')[1]).toBe('  ```')
      })
    })

    describe('multiple code blocks', () => {
      it('indents multiple code blocks in the same list item', () => {
        const input = [
          '1. Do this:',
          '```bash',
          'first command',
          '```',
          '   Then run:',
          '```bash',
          'second command',
          '```',
        ].join('\n')
        const result = indentCodeBlocksInLists(input)
        const lines = result.split('\n')
        expect(lines[1]).toBe('   ```bash')
        expect(lines[2]).toBe('   first command')
        expect(lines[3]).toBe('   ```')
        expect(lines[5]).toBe('   ```bash')
        expect(lines[6]).toBe('   second command')
        expect(lines[7]).toBe('   ```')
      })

      it('indents code blocks across different list items', () => {
        const input = [
          '1. First:',
          '```bash',
          'cmd1',
          '```',
          '2. Second:',
          '```bash',
          'cmd2',
          '```',
        ].join('\n')
        const result = indentCodeBlocksInLists(input)
        const lines = result.split('\n')
        expect(lines[1]).toBe('   ```bash')
        expect(lines[5]).toBe('   ```bash')
      })
    })

    describe('continuation text after code blocks', () => {
      it('allows continuation text to remain in list after code block', () => {
        // This is the key bug: indented text after an unindented code fence
        // was being rendered as an indented code block
        const input = [
          '1. Check:',
          '```bash',
          'some command',
          '```',
          '   Or do something else.',
        ].join('\n')
        const result = indentCodeBlocksInLists(input)
        const lines = result.split('\n')
        // Code fence should be indented
        expect(lines[1]).toBe('   ```bash')
        expect(lines[3]).toBe('   ```')
        // Continuation text should be unchanged (already at list indent)
        expect(lines[4]).toBe('   Or do something else.')
      })
    })

    describe('tilde fences', () => {
      it('handles tilde code fences in lists', () => {
        const input = ['1. Check:', '~~~bash', 'echo hi', '~~~'].join('\n')
        const result = indentCodeBlocksInLists(input)
        const lines = result.split('\n')
        expect(lines[1]).toBe('   ~~~bash')
        expect(lines[2]).toBe('   echo hi')
        expect(lines[3]).toBe('   ~~~')
      })
    })

    describe('code blocks outside lists', () => {
      it('does not modify code blocks that are not in a list', () => {
        const input = ['Some text:', '```bash', 'echo hello', '```'].join('\n')
        expect(indentCodeBlocksInLists(input)).toBe(input)
      })

      it('does not modify standalone code blocks', () => {
        const input = '```python\nprint("hi")\n```'
        expect(indentCodeBlocksInLists(input)).toBe(input)
      })
    })

    describe('empty code blocks', () => {
      it('handles empty code blocks in lists', () => {
        const input = ['1. Empty block:', '```', '```'].join('\n')
        const result = indentCodeBlocksInLists(input)
        const lines = result.split('\n')
        expect(lines[1]).toBe('   ```')
        expect(lines[2]).toBe('   ```')
      })
    })

    describe('code content with indentation', () => {
      it('preserves code content indentation while adding list indent', () => {
        const input = [
          '1. Python example:',
          '```python',
          'def foo():',
          '    return 42',
          '```',
        ].join('\n')
        const result = indentCodeBlocksInLists(input)
        const lines = result.split('\n')
        // Original indent preserved, list indent added
        expect(lines[2]).toBe('   def foo():')
        expect(lines[3]).toBe('       return 42')
      })
    })

    describe('partially indented fences', () => {
      it('adds only the missing indentation for partially indented fences', () => {
        // Fence at 1 space, list needs 3 spaces
        const input = ['1. Check:', ' ```bash', ' echo hello', ' ```'].join(
          '\n',
        )
        const result = indentCodeBlocksInLists(input)
        const lines = result.split('\n')
        // Should add 2 more spaces (3 - 1 = 2)
        expect(lines[1]).toBe('   ```bash')
        expect(lines[2]).toBe('   echo hello')
      })
    })

    describe('list exit detection', () => {
      it('stops indenting after leaving list context', () => {
        const input = [
          '1. In list:',
          '```bash',
          'cmd1',
          '```',
          '',
          'Not in list anymore.',
          '',
          '```bash',
          'standalone code',
          '```',
        ].join('\n')
        const result = indentCodeBlocksInLists(input)
        const lines = result.split('\n')
        // First code block should be indented
        expect(lines[1]).toBe('   ```bash')
        // "Not in list" exits the list
        // Standalone code block should NOT be indented
        expect(lines[7]).toBe('```bash')
      })
    })

    describe('real-world LLM output pattern', () => {
      it('fixes the Intel microcode example from the bug report', () => {
        const input = [
          '1.  **Check the running version:**',
          '```bash',
          'grep microcode /proc/cpuinfo | sort | uniq',
          '```',
          '2.  **Check the version available in the installed package:**',
          '    You can use `iucode_tool` to list the microcode revisions contained in the package files:',
          '```bash',
          'sudo apt install iucode-tool',
          'iucode_tool -l /lib/firmware/intel-ucode/* | grep -E "signature|revision"',
          '```',
          '    Or manually inspect the binary for your specific CPU signature (e.g., `06-55-04`).',
        ].join('\n')

        const result = indentCodeBlocksInLists(input)
        const lines = result.split('\n')

        // First code block indented to 4 (matching "1.  " content indent)
        expect(lines[1]).toBe('    ```bash')
        expect(lines[2]).toBe('    grep microcode /proc/cpuinfo | sort | uniq')
        expect(lines[3]).toBe('    ```')

        // Second code block also indented to 4
        expect(lines[6]).toBe('    ```bash')
        expect(lines[7]).toBe('    sudo apt install iucode-tool')
        expect(lines[9]).toBe('    ```')

        // Continuation text should be unchanged
        expect(lines[10]).toBe(
          '    Or manually inspect the binary for your specific CPU signature (e.g., `06-55-04`).',
        )
      })

      it('handles mixed list items with and without code blocks', () => {
        const input = [
          '1. First item with no code.',
          '2. Second item has code:',
          '```js',
          'console.log("hi")',
          '```',
          '3. Third item is plain text.',
          '4. Fourth item also has code:',
          '```python',
          'print("hello")',
          '```',
        ].join('\n')

        const result = indentCodeBlocksInLists(input)
        const lines = result.split('\n')

        // Item 1 unchanged
        expect(lines[0]).toBe('1. First item with no code.')
        // Item 2's code block indented
        expect(lines[2]).toBe('   ```js')
        // Item 3 unchanged
        expect(lines[5]).toBe('3. Third item is plain text.')
        // Item 4's code block indented
        expect(lines[7]).toBe('   ```python')
      })
    })
  })
})
