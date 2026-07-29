'use client'

import { ChatInterface } from '@/components/chat'
import { ProjectProvider } from '@/components/project'
import {
  isLocalNewChatStorage,
  NEW_CHAT_STORAGE_QUERY_KEY,
} from '@/utils/navigation'
import { useRouter } from 'next/router'

/**
 * Entry point for starting a new chat without any auto-opening intro/setup
 * modals. Pairs nicely with the `?q=` query parameter to send a prefilled
 * message immediately (e.g. /newchat?q=hello+world).
 */
export default function NewChatPage() {
  const router = useRouter()

  if (!router.isReady) return null

  const initialNewChatIsLocalOnly = isLocalNewChatStorage(
    router.query[NEW_CHAT_STORAGE_QUERY_KEY],
  )

  return (
    <div className="h-screen font-aeonik">
      <ProjectProvider>
        <ChatInterface
          initialNewChatIsLocalOnly={initialNewChatIsLocalOnly}
          suppressIntroModals
        />
      </ProjectProvider>
    </div>
  )
}
