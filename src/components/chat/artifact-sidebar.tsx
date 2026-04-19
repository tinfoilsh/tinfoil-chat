import {
  ArtifactPreviewPanel,
  type ArtifactPreviewSidebarDetail,
} from '@/components/chat/genui/components/ArtifactPreview'
import { cn } from '@/components/ui/utils'
import { EyeIcon, XMarkIcon } from '@heroicons/react/24/outline'
import React from 'react'
import { CONSTANTS } from './constants'

type ArtifactSidebarProps = {
  isOpen: boolean
  onClose: () => void
  artifact: ArtifactPreviewSidebarDetail | null
  isDarkMode: boolean
}

export function ArtifactSidebar({
  isOpen,
  onClose,
  artifact,
  isDarkMode,
}: ArtifactSidebarProps): React.JSX.Element {
  return (
    <>
      <div
        className={cn(
          'fixed right-0 top-0 z-40 flex h-full w-[85vw] flex-col border-l border-border-subtle bg-surface-chat-background font-aeonik transition-transform duration-200 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
        style={{ maxWidth: `${CONSTANTS.ARTIFACT_SIDEBAR_WIDTH_PX}px` }}
        aria-hidden={!isOpen}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-4 py-3">
          <div className="flex items-center gap-2 text-content-primary">
            <EyeIcon className="h-5 w-5" />
            <span className="text-sm font-medium">Preview</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-subtle bg-surface-chat text-content-secondary transition-colors hover:bg-surface-chat-background"
            aria-label="Close artifact sidebar"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 overflow-y-auto p-4">
          {artifact ? (
            <ArtifactPreviewPanel
              title={artifact.title}
              description={artifact.description}
              source={artifact.source}
              footer={artifact.footer}
              isDarkMode={isDarkMode}
              className="my-0 w-full"
            />
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 text-center">
              <p className="text-sm text-content-secondary">
                Open an artifact preview from the chat to inspect it here.
              </p>
            </div>
          )}
        </div>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}
    </>
  )
}
