import * as Headless from '@headlessui/react'
import { clsx } from 'clsx'
import { Inconsolata } from 'next/font/google'
import { Link } from './link'

const INCONSOLATA_FONT = Inconsolata({
  subsets: ['latin'],
  weight: ['500'],
})

const VARIANTS = {
  primary: clsx(
    'inline-flex items-center justify-center px-4 py-3',
    'rounded bg-button-send-background text-button-send-foreground',
    'whitespace-nowrap text-base font-medium',
    'data-[disabled]:bg-button-send-background/60 data-[hover]:bg-button-send-background/80 data-[disabled]:opacity-40',
    INCONSOLATA_FONT.className,
  ),
  secondary: clsx(
    'relative inline-flex items-center justify-center px-4 py-3',
    'rounded bg-surface-sidebar-button/15 ring-1 ring-brand-accent-light/20',
    'after:absolute after:inset-0 after:shadow-[inset_0_0_2px_1px_rgba(255,255,255,0.3)] after:content-[""]',
    'whitespace-nowrap text-base font-medium text-content-primary',
    'data-[disabled]:bg-surface-sidebar-button/10 data-[hover]:bg-surface-sidebar-button/25 data-[disabled]:opacity-40',
    INCONSOLATA_FONT.className,
  ),
  white: clsx(
    'inline-flex items-center justify-center px-4 py-3',
    'rounded bg-surface-card text-content-primary',
    'whitespace-nowrap text-base font-medium',
    'data-[disabled]:bg-surface-card/70 data-[hover]:bg-surface-card/90 data-[disabled]:opacity-40',
    INCONSOLATA_FONT.className,
  ),
  'white-outline': clsx(
    'inline-flex items-center justify-center px-4 py-3',
    'rounded border border-content-inverse/20 bg-transparent',
    'whitespace-nowrap text-base font-medium text-content-inverse',
    'data-[disabled]:bg-transparent data-[hover]:bg-content-inverse/10 data-[disabled]:opacity-40',
    INCONSOLATA_FONT.className,
  ),
  outline: clsx(
    'inline-flex items-center justify-center px-4 py-3',
    'rounded border border-transparent ring-1 ring-border-subtle',
    'whitespace-nowrap text-base font-medium text-content-primary',
    'data-[disabled]:bg-transparent data-[hover]:bg-surface-sidebar-button/40 data-[disabled]:opacity-40',
    INCONSOLATA_FONT.className,
  ),
}

type ButtonProps = {
  variant?: keyof typeof VARIANTS
} & (
  | React.ComponentPropsWithoutRef<typeof Link>
  | (Headless.ButtonProps & { href?: undefined })
)

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonProps) {
  className = clsx(className, VARIANTS[variant])

  if (typeof props.href === 'undefined') {
    return <Headless.Button {...props} className={className} />
  }

  return <Link {...props} className={className} />
}
