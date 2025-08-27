import { useEffect, useState } from 'react'

type PersonalizationSettings = {
  nickname: string
  profession: string
  traits: string[]
  additionalContext: string
  language: string
  isEnabled: boolean
}

type UseCustomSystemPromptReturn = {
  effectiveSystemPrompt: string
  processedRules: string
  isUsingPersonalization: boolean
}

export const useCustomSystemPrompt = (
  defaultSystemPrompt: string,
  rules: string = '',
): UseCustomSystemPromptReturn => {
  const [personalization, setPersonalization] =
    useState<PersonalizationSettings>({
      nickname: '',
      profession: '',
      traits: [],
      additionalContext: '',
      language: '',
      isEnabled: false,
    })

  const [isUsingCustomPrompt, setIsUsingCustomPrompt] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')

  // Load personalization settings from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedNickname = localStorage.getItem('userNickname') || ''
      const savedProfession = localStorage.getItem('userProfession') || ''
      const savedTraits = localStorage.getItem('userTraits')
      const savedContext = localStorage.getItem('userAdditionalContext') || ''
      const savedLanguage = localStorage.getItem('userLanguage')
      const savedEnabled =
        localStorage.getItem('isUsingPersonalization') === 'true'

      let traits: string[] = []
      if (savedTraits) {
        try {
          traits = JSON.parse(savedTraits)
        } catch {
          traits = []
        }
      }

      // Set language from localStorage or default to user's locale
      let language = ''
      if (savedLanguage) {
        language = savedLanguage
      } else {
        const userLocale = navigator.language || 'en-US'
        language =
          new Intl.DisplayNames([userLocale], { type: 'language' }).of(
            userLocale.split('-')[0],
          ) || 'English'
        localStorage.setItem('userLanguage', language)
      }

      setPersonalization({
        nickname: savedNickname,
        profession: savedProfession,
        traits,
        additionalContext: savedContext,
        language,
        isEnabled: savedEnabled,
      })

      // Load custom system prompt settings
      const savedUsingCustomPrompt = localStorage.getItem('isUsingCustomPrompt')
      const savedCustomPrompt = localStorage.getItem('customSystemPrompt')

      setIsUsingCustomPrompt(savedUsingCustomPrompt === 'true')
      setCustomPrompt(savedCustomPrompt || defaultSystemPrompt || '')
    }
  }, [defaultSystemPrompt])

  // Listen for personalization changes from settings sidebar
  useEffect(() => {
    const handlePersonalizationChange = (event: CustomEvent) => {
      const {
        nickname,
        profession,
        traits,
        additionalContext,
        language,
        isEnabled,
      } = event.detail
      setPersonalization({
        nickname: nickname || '',
        profession: profession || '',
        traits: traits || [],
        additionalContext: additionalContext || '',
        language: language || personalization.language, // Keep existing language if not provided
        isEnabled: isEnabled || false,
      })
    }

    const handleLanguageChange = (event: CustomEvent) => {
      const { language } = event.detail
      setPersonalization((prev) => ({
        ...prev,
        language: language || '',
      }))
    }

    const handleCustomPromptChange = (event: CustomEvent) => {
      const { isEnabled, customPrompt } = event.detail
      setIsUsingCustomPrompt(isEnabled || false)
      setCustomPrompt(customPrompt || defaultSystemPrompt || '')
    }

    window.addEventListener(
      'personalizationChanged',
      handlePersonalizationChange as EventListener,
    )
    window.addEventListener(
      'languageChanged',
      handleLanguageChange as EventListener,
    )
    window.addEventListener(
      'customSystemPromptChanged',
      handleCustomPromptChange as EventListener,
    )

    return () => {
      window.removeEventListener(
        'personalizationChanged',
        handlePersonalizationChange as EventListener,
      )
      window.removeEventListener(
        'languageChanged',
        handleLanguageChange as EventListener,
      )
      window.removeEventListener(
        'customSystemPromptChanged',
        handleCustomPromptChange as EventListener,
      )
    }
  }, [personalization.language, defaultSystemPrompt])

  // Generate the user preferences XML
  const generateUserPreferencesXML = (): string => {
    if (!personalization.isEnabled) {
      return ''
    }

    // Check if any personalization fields are filled
    const hasPersonalization =
      personalization.nickname.trim() ||
      personalization.profession.trim() ||
      personalization.traits.length > 0 ||
      personalization.additionalContext.trim()

    if (!hasPersonalization) {
      return ''
    }

    let userPreferencesXML =
      'The user has provided personal preferences for this conversation. Adapt your responses according to these settings while maintaining accuracy and helpfulness.\n\n<user_preferences>'

    if (personalization.nickname.trim()) {
      userPreferencesXML += `\n  <nickname>${personalization.nickname.trim()}</nickname>`
    }

    if (personalization.profession.trim()) {
      userPreferencesXML += `\n  <profession>${personalization.profession.trim()}</profession>`
    }

    if (personalization.traits.length > 0) {
      userPreferencesXML += '\n  <traits>'
      personalization.traits.forEach((trait) => {
        userPreferencesXML += `\n    <trait>${trait}</trait>`
      })
      userPreferencesXML += '\n  </traits>'
    }

    if (personalization.additionalContext.trim()) {
      userPreferencesXML += `\n  <additional_context>\n    ${personalization.additionalContext.trim()}\n  </additional_context>`
    }

    userPreferencesXML += '\n</user_preferences>'

    return userPreferencesXML
  }

  // Shared helper to replace placeholders in text
  const replacePlaceholders = (text: string): string => {
    // Generate user preferences XML only if personalization is enabled
    const userPreferencesXML = personalization.isEnabled
      ? generateUserPreferencesXML()
      : ''

    // Get the effective language (default to English if not set)
    const effectiveLanguage = personalization.language.trim() || 'English'

    // Generate current date/time string and timezone
    const now = new Date()
    const currentDateTime = now.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    })

    // Extract timezone separately
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

    // Replace all placeholders
    return text
      .replace('{USER_PREFERENCES}', userPreferencesXML)
      .replace('{LANGUAGE}', effectiveLanguage)
      .replace('{CURRENT_DATETIME}', currentDateTime)
      .replace('{TIMEZONE}', timezone)
  }

  // Generate the effective system prompt by replacing the placeholder
  const generatePersonalizedPrompt = (): string => {
    // Use custom prompt if enabled
    const basePrompt =
      isUsingCustomPrompt && customPrompt ? customPrompt : defaultSystemPrompt
    return replacePlaceholders(basePrompt)
  }

  const effectiveSystemPrompt = generatePersonalizedPrompt()

  // Apply the same replacements to rules
  const processRules = (): string => {
    if (!rules) return ''
    return replacePlaceholders(rules)
  }

  return {
    effectiveSystemPrompt,
    processedRules: processRules(),
    isUsingPersonalization: personalization.isEnabled,
  }
}
