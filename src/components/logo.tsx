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
    <div className="flex items-center gap-2">
      <Mark className={clsx(className)} dark={dark} />
      <span
        className={clsx(
          'font-helvetica-neue text-3xl font-semibold tracking-wide',
          dark ? 'text-white' : 'text-emerald-900',
        )}
      >
        Tinfoil
      </span>
    </div>
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
