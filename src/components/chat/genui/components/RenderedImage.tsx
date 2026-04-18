import CopyButton from '@/components/copy-button'
import { ImageWithSkeleton } from '@/components/preview/image-with-skeleton'
import { MermaidPreview } from '@/components/preview/mermaid-preview'
import { SvgPreview } from '@/components/preview/svg-preview'
import { Code2, Eye } from 'lucide-react'
import { useState } from 'react'

type ImageSource =
  | { type: 'url'; url: string }
  | { type: 'svg'; svg: string }
  | { type: 'base64'; data: string; mimeType: string }
  | { type: 'mermaid'; code: string }

interface RenderedImageProps {
  source: unknown
  alt?: string
  caption?: string
  isDarkMode?: boolean
}

type ViewMode = 'preview' | 'source'

function isImageSource(value: unknown): value is ImageSource {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  switch (v.type) {
    case 'url':
      return typeof v.url === 'string'
    case 'svg':
      return typeof v.svg === 'string'
    case 'base64':
      return typeof v.data === 'string' && typeof v.mimeType === 'string'
    case 'mermaid':
      return typeof v.code === 'string'
    default:
      return false
  }
}

function sourceToCopyString(source: ImageSource): string {
  switch (source.type) {
    case 'url':
      return source.url
    case 'svg':
      return source.svg
    case 'base64':
      return `data:${source.mimeType};base64,${source.data}`
    case 'mermaid':
      return source.code
  }
}

function Preview({
  source,
  alt,
  isDarkMode,
}: {
  source: ImageSource
  alt?: string
  isDarkMode: boolean
}) {
  switch (source.type) {
    case 'url':
      return (
        <ImageWithSkeleton
          src={source.url}
          alt={alt ?? ''}
          wrapperClassName="relative w-full overflow-hidden rounded-md bg-surface-card"
          className="h-auto max-h-[500px] w-full object-contain"
          loading="lazy"
        />
      )
    case 'base64':
      return (
        <ImageWithSkeleton
          src={`data:${source.mimeType};base64,${source.data}`}
          alt={alt ?? ''}
          wrapperClassName="relative w-full overflow-hidden rounded-md bg-surface-card"
          className="h-auto max-h-[500px] w-full object-contain"
          loading="lazy"
        />
      )
    case 'svg':
      return <SvgPreview code={source.svg} />
    case 'mermaid':
      return <MermaidPreview code={source.code} isDarkMode={isDarkMode} />
  }
}

export function RenderedImage({
  source,
  alt,
  caption,
  isDarkMode = true,
}: RenderedImageProps) {
  const [mode, setMode] = useState<ViewMode>('preview')

  if (!isImageSource(source)) return null

  const hasToggleableSource =
    source.type === 'svg' ||
    source.type === 'mermaid' ||
    source.type === 'base64'
  const copyText = sourceToCopyString(source)

  return (
    <figure className="my-3 overflow-hidden rounded-lg border border-border-subtle bg-surface-card">
      <div className="flex items-center justify-between border-b border-border-subtle bg-surface-chat-background px-3 py-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-content-muted">
          {source.type === 'mermaid'
            ? 'Diagram'
            : source.type === 'svg'
              ? 'SVG'
              : 'Image'}
        </span>
        <div className="flex items-center gap-1">
          {hasToggleableSource && (
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
          )}
          <CopyButton text={copyText} />
        </div>
      </div>
      <div className="p-3">
        {mode === 'preview' ? (
          <Preview source={source} alt={alt} isDarkMode={isDarkMode} />
        ) : (
          <pre className="max-h-[500px] overflow-auto rounded-md bg-surface-chat-background p-3 text-xs text-content-primary">
            <code>{copyText}</code>
          </pre>
        )}
      </div>
      {caption && (
        <figcaption className="border-t border-border-subtle bg-surface-chat-background px-3 py-2 text-xs text-content-muted">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}

export function validateRenderedImageProps(
  props: Record<string, unknown>,
): boolean {
  return isImageSource(props.source)
}
