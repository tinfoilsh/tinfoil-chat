/**
 * Global color definitions for consistent theming across the application
 *
 * Tinfoil Brand Colors:
 * - tinfoil-dark: #061820 (primary dark background)
 * - tinfoil-light: #EEF3F3 (light background)
 * - tinfoil-accent-dark: #004444 (primary brand color)
 * - tinfoil-accent-light: #68C7AC (accent/success color)
 */

export const colors = {
  // Tinfoil dark - used for dark backgrounds, headers, text
  'tinfoil-dark': {
    DEFAULT: '#061820',
    hover: '#0A2230',
  },

  // Tinfoil light - used for light backgrounds, cards
  'tinfoil-light': {
    DEFAULT: '#EEF3F3',
    hover: '#E5EFEF',
  },

  // Tinfoil accent dark - used for buttons, links, primary actions
  'tinfoil-accent-dark': {
    DEFAULT: '#004444',
    hover: '#005555',
    darker: '#003333',
  },

  // Tinfoil accent light - used for success states, checkmarks, accents
  'tinfoil-accent-light': {
    DEFAULT: '#68C7AC',
    hover: '#7FD4BB',
    darker: '#5AB39A',
  },

  // Legacy gray colors for general use
  gray: {
    light: '#EEF3F3',
    DEFAULT: '#D1D5DB',
    hover: '#9CA3AF',
  },

  // Alias for legacy references in diagrams/components
  mint: {
    dark: '#004444',
  },
} as const

export const TINFOIL_DARK = colors['tinfoil-dark'].DEFAULT
export const TINFOIL_DARK_HOVER = colors['tinfoil-dark'].hover
export const TINFOIL_LIGHT = colors['tinfoil-light'].DEFAULT
export const TINFOIL_LIGHT_HOVER = colors['tinfoil-light'].hover
export const TINFOIL_ACCENT_DARK = colors['tinfoil-accent-dark'].DEFAULT
export const TINFOIL_ACCENT_DARK_HOVER = colors['tinfoil-accent-dark'].hover
export const TINFOIL_ACCENT_DARK_DARKER = colors['tinfoil-accent-dark'].darker
export const TINFOIL_ACCENT_LIGHT = colors['tinfoil-accent-light'].DEFAULT
export const TINFOIL_ACCENT_LIGHT_HOVER = colors['tinfoil-accent-light'].hover
export const TINFOIL_ACCENT_LIGHT_DARKER = colors['tinfoil-accent-light'].darker

// Legacy exports for backward compatibility (will be phased out)
export const EMERALD_500 = colors['tinfoil-accent-light'].DEFAULT
export const EMERALD_600 = colors['tinfoil-accent-light'].darker

// Tailwind class names for when inline styles aren't suitable
export const colorClasses = {
  'tinfoil-dark': {
    bg: 'bg-brand-dark',
    bgHover: 'hover:bg-brand-dark/90',
    text: 'text-brand-dark',
    textHover: 'hover:text-brand-dark/90',
    border: 'border-brand-dark',
    borderHover: 'hover:border-brand-dark/90',
  },
  'tinfoil-light': {
    bg: 'bg-brand-light',
    bgHover: 'hover:bg-brand-light/90',
    text: 'text-brand-light',
    textHover: 'hover:text-brand-light/90',
    border: 'border-brand-light',
    borderHover: 'hover:border-brand-light/90',
  },
  'tinfoil-accent-dark': {
    bg: 'bg-brand-accent-dark',
    bgHover: 'hover:bg-brand-accent-dark/90',
    bgDarker: 'bg-brand-accent-dark-darker',
    text: 'text-brand-accent-dark',
    textHover: 'hover:text-brand-accent-dark/90',
    border: 'border-brand-accent-dark',
    borderHover: 'hover:border-brand-accent-dark/90',
    ring: 'ring-brand-accent-dark',
  },
  'tinfoil-accent-light': {
    bg: 'bg-brand-accent-light',
    bgHover: 'hover:bg-brand-accent-light/90',
    bgDarker: 'bg-brand-accent-light-darker',
    text: 'text-brand-accent-light',
    textHover: 'hover:text-brand-accent-light/90',
    border: 'border-brand-accent-light',
    borderHover: 'hover:border-brand-accent-light/90',
    ring: 'ring-brand-accent-light',
  },
  teal: {
    bg: 'bg-brand-accent-dark',
    bgHover: 'hover:bg-brand-accent-dark/90',
    text: 'text-brand-accent-dark',
    textHover: 'hover:text-brand-accent-dark/90',
    border: 'border-brand-accent-dark',
    borderHover: 'hover:border-brand-accent-dark/90',
    ring: 'ring-brand-accent-dark',
  },
  emerald: {
    text500: 'text-brand-accent-light',
    text600: 'text-brand-accent-light-darker',
    bg500: 'bg-brand-accent-light',
    bg600: 'bg-brand-accent-light-darker',
    border500: 'border-brand-accent-light',
    border600: 'border-brand-accent-light-darker',
  },
} as const

export const TINFOIL_COLORS = {
  brand: {
    dark: colors['tinfoil-dark'].DEFAULT,
    light: colors['tinfoil-light'].DEFAULT,
    accentDark: colors['tinfoil-accent-dark'].DEFAULT,
    accentLight: colors['tinfoil-accent-light'].DEFAULT,
  },
  surface: {
    cardLight: colors['tinfoil-light'].DEFAULT,
    cardDark: '#1C1C1E',
  },
  content: {
    inverseLight: colors['tinfoil-light'].DEFAULT,
    inverseDark: colors['tinfoil-dark'].DEFAULT,
  },
  utility: {
    qrForegroundLight: '#0B0B0C',
    qrForegroundDark: '#F9FAFB',
    qrForeground: '#000000',
    destructive: '#CC0000',
  },
} as const
