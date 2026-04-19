import CopyButton from '@/components/copy-button'
import { MermaidPreview } from '@/components/preview/mermaid-preview'
import { SvgPreview } from '@/components/preview/svg-preview'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardTitle,
} from '@/components/ui/card'
import { Code2, ExternalLink, Eye } from 'lucide-react'
import React from 'react'
import ReactMarkdown from 'react-markdown'
import { coerceObject } from './input-coercion'

export const OPEN_ARTIFACT_PREVIEW_EVENT = 'openArtifactPreviewSidebar'

export type ArtifactSource =
  | { type: 'url'; url: string }
  | { type: 'html'; html: string }
  | { type: 'markdown'; markdown: string }
  | { type: 'svg'; svg: string }
  | { type: 'mermaid'; code: string }

interface ArtifactPreviewProps {
  title?: string
  description?: string
  source: unknown
  footer?: string
  isDarkMode?: boolean
}

export interface ArtifactPreviewSidebarDetail {
  title?: string
  description?: string
  source: ArtifactSource
  footer?: string
}

type ViewMode = 'preview' | 'source'

function getArtifactSource(value: unknown): ArtifactSource | null {
  const source = coerceObject<Record<string, unknown>>(value)

  switch (source.type) {
    case 'url':
      return typeof source.url === 'string'
        ? { type: 'url', url: source.url }
        : null
    case 'html':
      return typeof source.html === 'string'
        ? { type: 'html', html: source.html }
        : null
    case 'markdown':
      return typeof source.markdown === 'string'
        ? { type: 'markdown', markdown: source.markdown }
        : null
    case 'svg':
      return typeof source.svg === 'string'
        ? { type: 'svg', svg: source.svg }
        : null
    case 'mermaid':
      return typeof source.code === 'string'
        ? { type: 'mermaid', code: source.code }
        : null
    default:
      return null
  }
}

export function getArtifactPreviewDetail(
  props: Pick<
    ArtifactPreviewProps,
    'title' | 'description' | 'source' | 'footer'
  >,
): ArtifactPreviewSidebarDetail | null {
  const source = getArtifactSource(props.source)
  if (!source) return null

  return {
    title: props.title,
    description: props.description,
    source,
    footer: props.footer,
  }
}

export function openArtifactPreviewSidebar(
  detail: ArtifactPreviewSidebarDetail,
): void {
  if (typeof window === 'undefined') return

  window.dispatchEvent(
    new CustomEvent<ArtifactPreviewSidebarDetail>(OPEN_ARTIFACT_PREVIEW_EVENT, {
      detail,
    }),
  )
}

function getSourceLabel(source: ArtifactSource): string {
  switch (source.type) {
    case 'url':
      return 'Hosted preview'
    case 'html':
      return 'HTML artifact'
    case 'markdown':
      return 'Markdown artifact'
    case 'svg':
      return 'SVG artifact'
    case 'mermaid':
      return 'Diagram artifact'
  }
}

function sourceToCopyString(source: ArtifactSource): string {
  switch (source.type) {
    case 'url':
      return source.url
    case 'html':
      return source.html
    case 'markdown':
      return source.markdown
    case 'svg':
      return source.svg
    case 'mermaid':
      return source.code
  }
}

function Preview({
  source,
  title,
  isDarkMode,
}: {
  source: ArtifactSource
  title?: string
  isDarkMode: boolean
}) {
  switch (source.type) {
    case 'url':
      return (
        <iframe
          title={title ?? 'Artifact preview'}
          src={source.url}
          sandbox="allow-forms allow-modals allow-popups allow-scripts"
          referrerPolicy="no-referrer"
          className="h-[420px] w-full rounded-md border-0 bg-white"
        />
      )
    case 'html':
      return (
        <iframe
          title={title ?? 'Artifact preview'}
          srcDoc={source.html}
          sandbox="allow-forms allow-modals allow-popups allow-scripts"
          referrerPolicy="no-referrer"
          className="h-[420px] w-full rounded-md border-0 bg-white"
        />
      )
    case 'markdown':
      return (
        <div className="prose prose-sm max-w-none text-content-primary dark:prose-invert">
          <ReactMarkdown>{source.markdown}</ReactMarkdown>
        </div>
      )
    case 'svg':
      return <SvgPreview code={source.svg} />
    case 'mermaid':
      return <MermaidPreview code={source.code} isDarkMode={isDarkMode} />
  }
}

interface ArtifactPreviewPanelProps extends ArtifactPreviewSidebarDetail {
  isDarkMode?: boolean
  className?: string
}

export function ArtifactPreviewPanel({
  title,
  description,
  source,
  footer,
  isDarkMode = true,
  className,
}: ArtifactPreviewPanelProps) {
  const [mode, setMode] = React.useState<ViewMode>('preview')

  const copyText = sourceToCopyString(source)

  return (
    <Card className={className ?? 'my-3 overflow-hidden'}>
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle bg-surface-chat-background px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-content-muted">
            {getSourceLabel(source)}
          </p>
          {title && <CardTitle className="mt-1 text-base">{title}</CardTitle>}
          {description && (
            <CardDescription className="mt-1">{description}</CardDescription>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMode(mode === 'preview' ? 'source' : 'preview')}
            className="flex h-6 items-center gap-1 rounded px-2 text-xs text-content-muted hover:bg-surface-card hover:text-content-primary"
          >
            {mode === 'preview' ? (
              <>
                <Code2 className="h-3.5 w-3.5" />
                <span>Source</span>
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5" />
                <span>Preview</span>
              </>
            )}
          </button>
          {source.type === 'url' && (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-6 items-center gap-1 rounded px-2 text-xs text-content-muted hover:bg-surface-card hover:text-content-primary"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Open</span>
            </a>
          )}
          <CopyButton text={copyText} />
        </div>
      </div>
      <CardContent className="p-4">
        {mode === 'preview' ? (
          <Preview source={source} title={title} isDarkMode={isDarkMode} />
        ) : (
          <pre className="max-h-[420px] overflow-auto rounded-md bg-surface-chat-background p-3 text-xs text-content-primary">
            <code>{copyText}</code>
          </pre>
        )}
      </CardContent>
      {footer && (
        <CardFooter className="border-t border-border-subtle bg-surface-chat-background px-4 py-3">
          <p className="text-xs text-content-muted">{footer}</p>
        </CardFooter>
      )}
    </Card>
  )
}

export function ArtifactPreview({
  title,
  description,
  source,
  footer,
}: ArtifactPreviewProps) {
  const detail = getArtifactPreviewDetail({
    title,
    description,
    source,
    footer,
  })

  if (!detail) return null

  const copyText = sourceToCopyString(detail.source)

  return (
    <Card className="my-3 overflow-hidden">
      <div className="border-b border-border-subtle bg-surface-chat-background px-4 py-2.5">
        <p className="text-xs font-medium uppercase tracking-wide text-content-muted">
          {getSourceLabel(detail.source)}
        </p>
        {title && <CardTitle className="mt-1 text-base">{title}</CardTitle>}
        {description && (
          <CardDescription className="mt-1">{description}</CardDescription>
        )}
      </div>
      <CardContent className="space-y-3 p-4">
        <p className="text-sm text-content-muted">
          Preview opens in the sidebar.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openArtifactPreviewSidebar(detail)}
            className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-surface-chat-background px-3 py-1.5 text-sm font-medium text-content-primary transition-colors hover:bg-surface-card"
          >
            <Eye className="h-4 w-4" />
            <span>Open preview</span>
          </button>
          {detail.source.type === 'url' && (
            <a
              href={detail.source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-surface-chat-background px-3 py-1.5 text-sm font-medium text-content-primary transition-colors hover:bg-surface-card"
            >
              <ExternalLink className="h-4 w-4" />
              <span>Open source</span>
            </a>
          )}
          <CopyButton text={copyText} />
        </div>
      </CardContent>
      {footer && (
        <CardFooter className="border-t border-border-subtle bg-surface-chat-background px-4 py-3">
          <p className="text-xs text-content-muted">{footer}</p>
        </CardFooter>
      )}
    </Card>
  )
}

export function validateArtifactPreviewProps(
  props: Record<string, unknown>,
): boolean {
  return getArtifactSource(props.source) !== null
}
