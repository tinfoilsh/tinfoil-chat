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
      width={194}
      height={50}
      className={clsx(className)}
      priority
    />
  )
}
