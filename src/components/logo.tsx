'use client'

import { clsx } from 'clsx'
import Image from 'next/image'

export function Logo({
  className,
  dark,
}: {
  className?: string
  dark?: boolean
}) {
  return (
    <Image
      src={dark ? '/logo-white.svg' : '/logo-green.svg'}
      alt="Tinfoil"
      width={120}
      height={50}
      className={clsx(className)}
      priority
    />
  )
}

export function Mark({
  className,
  dark,
}: {
  className?: string
  dark?: boolean
}) {
  return (
    <Image
      src="/icon.png"
      alt="Tinfoil Icon"
      width={34}
      height={34}
      className={clsx(className, {
        'brightness-0 invert': dark,
      })}
      priority
    />
  )
}
