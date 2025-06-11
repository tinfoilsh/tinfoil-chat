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
    'rounded bg-gray-900 text-white',
    'whitespace-nowrap text-base font-medium',
    'data-[disabled]:bg-gray-950 data-[hover]:bg-gray-800 data-[disabled]:opacity-40',
    INCONSOLATA_FONT.className,
  ),
  secondary: clsx(
    'relative inline-flex items-center justify-center px-4 py-3',
    'rounded bg-white/15 ring-1 ring-[#D15052]/15',
    'after:absolute after:inset-0 after:shadow-[inset_0_0_2px_1px_#ffffff4d]',
    'whitespace-nowrap text-base font-medium text-gray-950',
    'data-[disabled]:bg-white/15 data-[hover]:bg-white/20 data-[disabled]:opacity-40',
    INCONSOLATA_FONT.className,
  ),
  white: clsx(
    'inline-flex items-center justify-center px-4 py-3',
    'rounded bg-white text-gray-900',
    'whitespace-nowrap text-base font-medium',
    'data-[disabled]:bg-white data-[hover]:bg-gray-100 data-[disabled]:opacity-40',
    INCONSOLATA_FONT.className,
  ),
  'white-outline': clsx(
    'inline-flex items-center justify-center px-4 py-3',
    'rounded border border-white/20 bg-transparent',
    'whitespace-nowrap text-base font-medium text-white',
    'data-[disabled]:bg-transparent data-[hover]:bg-white/10 data-[disabled]:opacity-40',
    INCONSOLATA_FONT.className,
  ),
  outline: clsx(
    'inline-flex items-center justify-center px-4 py-3',
    'rounded border border-transparent ring-1 ring-black/10',
    'whitespace-nowrap text-base font-medium text-gray-950',
    'data-[disabled]:bg-transparent data-[hover]:bg-gray-50 data-[disabled]:opacity-40',
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
