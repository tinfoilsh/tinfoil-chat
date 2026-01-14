import { useRouter } from 'next/router'
import { useCallback, useEffect, useState } from 'react'

interface UseChatRouterReturn {
  initialChatId: string | null
  initialProjectId: string | null
  isRouterReady: boolean
  updateUrlForChat: (chatId: string, projectId?: string) => void
  updateUrlForProject: (projectId: string) => void
  clearUrl: () => void
}

export function useChatRouter(): UseChatRouterReturn {
  const router = useRouter()
  const [isRouterReady, setIsRouterReady] = useState(false)

  // Parse initial values from URL when router is ready
  const initialChatId =
    router.isReady && typeof router.query.chatId === 'string'
      ? router.query.chatId
      : null
  const initialProjectId =
    router.isReady && typeof router.query.projectId === 'string'
      ? router.query.projectId
      : null

  // Mark router as ready
  useEffect(() => {
    if (router.isReady && !isRouterReady) {
      setIsRouterReady(true)
    }
  }, [router.isReady, isRouterReady])

  // Update URL when chat changes
  // Use history.replaceState directly to avoid Next.js route changes
  // This keeps us on the same page component while updating the URL
  const updateUrlForChat = useCallback((chatId: string, projectId?: string) => {
    if (typeof window === 'undefined') return

    const newPath = projectId
      ? `/project/${projectId}/chat/${chatId}`
      : `/chat/${chatId}`

    // Only update if path actually changed
    if (window.location.pathname !== newPath) {
      window.history.replaceState(
        { ...window.history.state, as: newPath, url: newPath },
        '',
        newPath,
      )
    }
  }, [])

  // Update URL when in project mode with blank chat
  const updateUrlForProject = useCallback((projectId: string) => {
    if (typeof window === 'undefined') return

    const newPath = `/project/${projectId}`

    if (window.location.pathname !== newPath) {
      window.history.replaceState(
        { ...window.history.state, as: newPath, url: newPath },
        '',
        newPath,
      )
    }
  }, [])

  // Clear URL when going to blank/new chat
  const clearUrl = useCallback(() => {
    if (typeof window === 'undefined') return

    if (window.location.pathname !== '/') {
      window.history.replaceState(
        { ...window.history.state, as: '/', url: '/' },
        '',
        '/',
      )
    }
  }, [])

  return {
    initialChatId,
    initialProjectId,
    isRouterReady,
    updateUrlForChat,
    updateUrlForProject,
    clearUrl,
  }
}
