/* eslint-disable react/no-unescaped-entities */
import { MoonIcon, SunIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { CONSTANTS } from './constants'

type SettingsSidebarProps = {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  isDarkMode: boolean
  toggleTheme: () => void
  isClient: boolean
}

export function SettingsSidebar({
  isOpen,
  setIsOpen,
  isDarkMode,
  toggleTheme,
  isClient,
}: SettingsSidebarProps) {
  const [maxMessages, setMaxMessages] = useState<number>(
    CONSTANTS.MAX_PROMPT_MESSAGES,
  )

  // Load max messages setting from localStorage
  useEffect(() => {
    if (isClient) {
      const saved = localStorage.getItem('maxPromptMessages')
      if (saved) {
        const parsedValue = parseInt(saved, 10)
        if (!isNaN(parsedValue) && parsedValue > 0 && parsedValue <= 50) {
          setMaxMessages(parsedValue)
        }
      }
    }
  }, [isClient])

  // Save max messages setting to localStorage
  const handleMaxMessagesChange = (value: number) => {
    if (value > 0 && value <= 50) {
      setMaxMessages(value)
      if (isClient) {
        localStorage.setItem('maxPromptMessages', value.toString())
        // Trigger a custom event to notify other components
        window.dispatchEvent(
          new CustomEvent('maxPromptMessagesChanged', {
            detail: value,
          }),
        )
      }
    }
  }

  const handleThemeToggle = () => {
    toggleTheme()
  }

  return (
    <>
      {/* Settings sidebar */}
      <motion.div
        initial={false}
        animate={{
          x: isOpen ? 0 : '100%',
        }}
        transition={{
          type: 'spring',
          damping: 30,
          stiffness: 300,
        }}
        className={`fixed right-0 top-0 z-50 flex h-full w-[85vw] max-w-[300px] flex-col border-l ${
          isDarkMode
            ? 'border-gray-800 bg-gray-900'
            : 'border-gray-200 bg-white'
        } overflow-hidden md:w-[300px]`}
      >
        {/* Header */}
        <div
          className={`flex h-16 flex-none items-center justify-between border-b ${
            isDarkMode ? 'border-gray-800' : 'border-gray-200'
          } p-4`}
        >
          <h2
            className={`text-lg font-semibold ${
              isDarkMode ? 'text-gray-100' : 'text-gray-900'
            }`}
          >
            Settings
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            className={`rounded-lg p-2 transition-all duration-200 ${
              isDarkMode
                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Settings content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6">
            {/* Appearance section */}
            <div>
              <h3
                className={`mb-3 text-sm font-medium ${
                  isDarkMode ? 'text-gray-200' : 'text-gray-800'
                }`}
              >
                Appearance
              </h3>
              <div className="space-y-2">
                <div
                  className={`flex items-center justify-between rounded-lg p-3 ${
                    isDarkMode ? 'bg-gray-800' : 'bg-gray-100'
                  }`}
                >
                  <div>
                    <div
                      className={`text-sm font-medium ${
                        isDarkMode ? 'text-gray-200' : 'text-gray-800'
                      }`}
                    >
                      Theme
                    </div>
                    <div
                      className={`text-xs ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}
                    >
                      Choose between light and dark mode
                    </div>
                  </div>
                  <button
                    onClick={handleThemeToggle}
                    className={`rounded-lg p-2 transition-all duration-200 ${
                      isDarkMode
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-white text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {isDarkMode ? (
                      <SunIcon className="h-5 w-5" />
                    ) : (
                      <MoonIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Chat Settings */}
            <div>
              <h3
                className={`mb-3 text-sm font-medium ${
                  isDarkMode ? 'text-gray-200' : 'text-gray-800'
                }`}
              >
                Chat Settings
              </h3>
              <div className="space-y-2">
                <div
                  className={`rounded-lg p-3 ${
                    isDarkMode ? 'bg-gray-800' : 'bg-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="mr-3 flex-1">
                      <div
                        className={`text-sm font-medium ${
                          isDarkMode ? 'text-gray-200' : 'text-gray-800'
                        }`}
                      >
                        Messages in Context
                      </div>
                      <div
                        className={`text-xs ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-600'
                        }`}
                      >
                        Maximum number of recent messages sent to the model
                        (1-50). Longer contexts increase network usage and slow
                        down responses.
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={maxMessages}
                        onChange={(e) => {
                          const value = parseInt(e.target.value, 10)
                          if (!isNaN(value)) {
                            handleMaxMessagesChange(value)
                          }
                        }}
                        className={`w-16 rounded-md border px-2 py-1 text-center text-sm ${
                          isDarkMode
                            ? 'border-gray-600 bg-gray-700 text-gray-200'
                            : 'border-gray-300 bg-white text-gray-900'
                        } focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}
