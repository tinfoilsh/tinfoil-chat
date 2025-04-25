/* eslint-disable react/no-unescaped-entities */

import { PaperAirplaneIcon, StopIcon } from '@heroicons/react/24/outline'
import type { FormEvent, RefObject } from 'react'
import { Link } from '../link'
import type { LoadingState } from './types'

type ChatInputProps = {
  input: string
  setInput: (value: string) => void
  handleSubmit: (e: FormEvent) => void
  loadingState: LoadingState
  cancelGeneration: () => void
  inputRef: RefObject<HTMLTextAreaElement>
  handleInputFocus: () => void
  inputMinHeight: string
  isDarkMode: boolean
}

export function ChatInput({
  input,
  setInput,
  handleSubmit,
  loadingState,
  cancelGeneration,
  inputRef,
  handleInputFocus,
  inputMinHeight,
  isDarkMode,
}: ChatInputProps) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className={`flex items-end gap-2 rounded-xl border py-2 pl-2 shadow-lg ${
          isDarkMode
            ? 'border-gray-600 bg-gray-700'
            : 'border-gray-300 bg-gray-100'
        }`}
      >
        <div className="relative flex flex-1">
          <textarea
            ref={inputRef}
            value={input}
            onFocus={handleInputFocus}
            onChange={(e) => {
              setInput(e.target.value)
              e.target.style.height = inputMinHeight
              e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (loadingState === 'idle') {
                  handleSubmit(e)
                }
              }
            }}
            placeholder="Message Tin..."
            rows={1}
            className={`w-full resize-none overflow-y-auto bg-transparent px-2 py-0.5 text-base placeholder-gray-400 focus:outline-none ${
              isDarkMode ? 'text-gray-100' : 'text-gray-900'
            } pr-10`}
            style={{
              minHeight: inputMinHeight,
              maxHeight: '200px',
            }}
          />
          <div className="absolute bottom-0 right-0 flex items-center">
            <button
              type="submit"
              onClick={
                loadingState === 'loading' ? cancelGeneration : undefined
              }
              className={`mr-2 rounded-lg p-1.5 ${
                isDarkMode
                  ? 'text-gray-300 hover:bg-gray-600'
                  : 'text-gray-600 hover:bg-gray-200'
              } disabled:opacity-50`}
            >
              {loadingState === 'loading' ? (
                <StopIcon className="h-5 w-5" />
              ) : (
                <PaperAirplaneIcon className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Terms and privacy policy */}
      <div className="mt-2">
        <p
          className={`text-xs ${
            isDarkMode ? 'text-gray-400' : 'text-gray-500'
          } text-center`}
        >
          By using this service, you agree to Tinfoil's{' '}
          <Link href="/terms" className="hover:text-emerald-500">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="hover:text-emerald-500">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  )
}
