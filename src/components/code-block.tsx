'use client'

import { useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import {
  oneDark,
  oneLight,
} from 'react-syntax-highlighter/dist/esm/styles/prism'
import { CONSTANTS } from './chat/constants'

const DARK_THEME = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...oneDark['pre[class*="language-"]'],
    background: 'transparent',
  },
  'code[class*="language-"]': {
    ...oneDark['code[class*="language-"]'],
    background: 'transparent',
  },
  'token.operator': {
    ...oneDark['token.operator'],
    background: 'transparent',
  },
}

const LIGHT_THEME = {
  ...oneLight,
  'pre[class*="language-"]': {
    ...oneLight['pre[class*="language-"]'],
    background: 'transparent',
  },
  'code[class*="language-"]': {
    ...oneLight['code[class*="language-"]'],
    background: 'transparent',
  },
  'token.operator': {
    ...oneLight['token.operator'],
    background: 'transparent',
  },
}

export function CodeBlock({
  code,
  language,
  isDarkMode = true,
}: {
  code: string
  language: string
  isDarkMode?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), CONSTANTS.COPY_TIMEOUT_MS)
  }

  return (
    <div className="group relative overflow-x-auto">
      <button
        onClick={copyToClipboard}
        className={`absolute right-2 top-2 rounded-lg p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${
          isDarkMode
            ? 'bg-gray-800 hover:bg-gray-700'
            : 'bg-gray-200 hover:bg-gray-300'
        }`}
      >
        {copied ? (
          <svg
            className="h-5 w-5 text-green-400"
            fill="none"
            strokeWidth="1.5"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        ) : (
          <svg
            className={`h-5 w-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
            fill="none"
            strokeWidth="1.5"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
            />
          </svg>
        )}
      </button>
      <SyntaxHighlighter
        language={language}
        style={isDarkMode ? DARK_THEME : LIGHT_THEME}
        customStyle={{
          borderRadius: '0.5rem',
          margin: 0,
          fontSize: '0.875rem',
          background: isDarkMode ? '#111111' : '#f8f9fa',
          border: isDarkMode
            ? '1px solid rgb(31 41 55)'
            : '1px solid rgb(229 231 235)',
          overflowX: 'auto',
          // Ensure vertical scroll isn’t trapped; let page handle it
          overflowY: 'visible',
          maxWidth: '100%',
        }}
        wrapLongLines={false}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}
