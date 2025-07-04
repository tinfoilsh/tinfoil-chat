import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'

type StatusIconProps = {
  status: 'pending' | 'loading' | 'success' | 'error'
}

export function StatusIcon({ status }: StatusIconProps) {
  const iconMap = {
    success: {
      bg: 'bg-emerald-500',
      icon: <CheckIcon className="h-3 w-3 text-white" />,
    },
    error: {
      bg: 'bg-red-500',
      icon: <XMarkIcon className="h-3 w-3 text-white" />,
    },
    loading: {
      bg: 'bg-blue-500',
      icon: (
        <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
      ),
    },
    pending: {
      bg: 'bg-gray-500',
      icon: null,
    },
  }

  const { bg, icon } = iconMap[status]

  return (
    <div
      className={`flex h-6 w-6 items-center justify-center rounded-full ${bg}`}
    >
      {icon}
    </div>
  )
}
