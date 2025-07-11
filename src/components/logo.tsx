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
      src={dark ? '/tinfoill-logo.png' : '/tinfoill-logo-light.png'}
      alt="Tinfoil"
      width={200}
      height={90}
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
