'use client'

import {
  AcademicCapIcon,
  CodeBracketIcon,
  PencilIcon,
  SparklesIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { AnimatePresence, motion } from 'framer-motion'
import { memo, useEffect, useRef, useState } from 'react'
import { promptCategories, type PromptCategory } from './prompt-selector-data'

type PromptSelectorProps = {
  isDarkMode: boolean
  onSelectPrompt: (prompt: string) => void
}

const CategoryIcon = ({
  icon,
  className,
}: {
  icon: string
  className?: string
}) => {
  switch (icon) {
    case 'write':
      return <PencilIcon className={className} />
    case 'learn':
      return <AcademicCapIcon className={className} />
    case 'code':
      return <CodeBracketIcon className={className} />
    case 'life':
      return <SparklesIcon className={className} />
    default:
      return null
  }
}

export const PromptSelector = memo(function PromptSelector({
  isDarkMode,
  onSelectPrompt,
}: PromptSelectorProps) {
  const [selectedCategory, setSelectedCategory] =
    useState<PromptCategory | null>(null)
  const [activeButtonRef, setActiveButtonRef] =
    useState<HTMLButtonElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonsContainerRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !buttonsContainerRef.current?.contains(event.target as Node)
      ) {
        setSelectedCategory(null)
        setActiveButtonRef(null)
      }
    }

    if (selectedCategory) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [selectedCategory])

  // Close dropdown on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedCategory(null)
        setActiveButtonRef(null)
      }
    }

    if (selectedCategory) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [selectedCategory])

  // Calculate dropdown position
  const getDropdownPosition = () => {
    if (!activeButtonRef) return {}

    const buttonRect = activeButtonRef.getBoundingClientRect()
    const containerRect = buttonsContainerRef.current?.getBoundingClientRect()

    if (!containerRect) return {}

    // Calculate position relative to the buttons container
    const relativeLeft = buttonRect.left - containerRect.left

    return {
      position: 'absolute' as const,
      left: `${relativeLeft}px`,
      bottom: '100%', // Position above the buttons
      marginBottom: '8px',
      minWidth: '300px',
      maxWidth: '400px',
      zIndex: 50,
    }
  }

  const handleCategoryClick = (
    category: PromptCategory,
    buttonElement: HTMLButtonElement,
  ) => {
    if (selectedCategory?.id === category.id) {
      setSelectedCategory(null)
      setActiveButtonRef(null)
    } else {
      setSelectedCategory(category)
      setActiveButtonRef(buttonElement)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.6 }}
      className="mt-12"
    >
      <h3
        className={`mb-4 text-sm font-medium ${
          isDarkMode ? 'text-gray-400' : 'text-gray-600'
        }`}
      >
        Start with a prompt
      </h3>

      {/* Container with relative positioning for dropdown */}
      <div className="relative">
        <div ref={buttonsContainerRef} className="flex flex-wrap gap-3">
          {promptCategories.map((category) => (
            <button
              key={category.id}
              onClick={(e) => handleCategoryClick(category, e.currentTarget)}
              className={`group flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                selectedCategory?.id === category.id
                  ? isDarkMode
                    ? 'border-emerald-600 bg-emerald-950/50 text-emerald-400'
                    : 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : isDarkMode
                    ? 'border-gray-700 text-gray-300 hover:border-gray-600 hover:bg-gray-800'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              <CategoryIcon
                icon={category.icon}
                className="h-4 w-4 transition-transform group-hover:scale-110"
              />
              {category.label}
            </button>
          ))}
        </div>

        {/* Dropdown */}
        <AnimatePresence>
          {selectedCategory && (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className={`absolute rounded-xl ${
                isDarkMode ? 'bg-gray-800' : 'bg-white'
              } border shadow-xl ${
                isDarkMode ? 'border-gray-700' : 'border-gray-200'
              } overflow-hidden`}
              style={getDropdownPosition()}
            >
              {/* Dropdown Header */}
              <div
                className={`flex items-center justify-between border-b px-4 py-3 ${
                  isDarkMode
                    ? 'border-gray-700 bg-gray-800'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <CategoryIcon
                    icon={selectedCategory.icon}
                    className={`h-4 w-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                  />
                  <h2
                    className={`text-sm font-medium ${
                      isDarkMode ? 'text-gray-100' : 'text-gray-900'
                    }`}
                  >
                    {selectedCategory.label}
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setSelectedCategory(null)
                    setActiveButtonRef(null)
                  }}
                  className={`rounded-lg p-1 transition-colors ${
                    isDarkMode
                      ? 'text-gray-400 hover:bg-gray-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>

              {/* Prompt List */}
              <div className="overflow-y-auto" style={{ maxHeight: '300px' }}>
                {selectedCategory.prompts.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      onSelectPrompt(prompt.prompt)
                      setSelectedCategory(null)
                      setActiveButtonRef(null)
                    }}
                    className={`w-full px-4 py-2.5 text-left transition-colors ${
                      isDarkMode
                        ? 'text-gray-300 hover:bg-gray-700/50'
                        : 'text-gray-700 hover:bg-gray-50'
                    } ${index !== 0 ? 'border-t ' + (isDarkMode ? 'border-gray-700/50' : 'border-gray-100') : ''}`}
                  >
                    <div
                      className={`text-sm ${
                        isDarkMode ? 'text-gray-200' : 'text-gray-900'
                      }`}
                    >
                      {prompt.title}
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
})
