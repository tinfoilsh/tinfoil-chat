import {
  ArrowTopRightOnSquareIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'

type StepItemProps = {
  text: string
  status: 'pending' | 'loading' | 'success' | 'error'
  link?: string
}

export function StepItem({ text, status, link }: StepItemProps) {
  return (
    <li className="flex items-center gap-2">
      <CheckIcon
        className={`h-4 w-4 ${
          status === 'success' ? 'text-emerald-500' : 'text-gray-500'
        }`}
      />
      <div className="flex items-center gap-2">
        <span
          className={`text-sm ${
            status === 'success' ? 'text-emerald-500' : 'text-gray-400'
          }`}
        >
          {text}
        </span>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-gray-400"
          >
            <ArrowTopRightOnSquareIcon className="h-3 w-3" />
          </a>
        )}
      </div>
    </li>
  )
}
