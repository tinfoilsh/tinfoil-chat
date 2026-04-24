import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface InfoCardProps {
  title: string
  description?: string
  content?: string
  footer?: string
}

export function InfoCard({
  title,
  description,
  content,
  footer,
}: InfoCardProps) {
  return (
    <Card className="my-3 max-w-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {content && (
        <CardContent>
          <div className="prose prose-sm max-w-none text-sm text-content-primary dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        </CardContent>
      )}
      {footer && (
        <CardFooter>
          <p className="text-xs text-content-muted">{footer}</p>
        </CardFooter>
      )}
    </Card>
  )
}

export function validateInfoCardProps(props: Record<string, unknown>): boolean {
  return typeof props.title === 'string'
}
