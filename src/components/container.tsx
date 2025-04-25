import { clsx } from 'clsx'

export function Container({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={clsx(className, 'w-full px-4 sm:px-6 lg:px-8')}>
      <div className="mx-auto max-w-full sm:max-w-2xl lg:max-w-7xl">
        {children}
      </div>
    </div>
  )
}
