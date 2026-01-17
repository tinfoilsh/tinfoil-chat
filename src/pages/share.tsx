import { initializeRenderers } from '@/components/chat/renderers/client'
import { SharedChatView } from '@/components/chat/shared-chat-view'
import { getAIModels, type BaseModel } from '@/config/models'
import {
  parseShareableChatData,
  safeDecompress,
  type ShareableChatData,
} from '@/utils/compression'
import Link from 'next/link'
import { useEffect, useState } from 'react'

type LoadingState = 'loading' | 'error' | 'success'

export default function SharePage() {
  const [loadingState, setLoadingState] = useState<LoadingState>('loading')
  const [chatData, setChatData] = useState<ShareableChatData | null>(null)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [model, setModel] = useState<BaseModel | null>(null)

  useEffect(() => {
    initializeRenderers()
  }, [])

  useEffect(() => {
    const checkDarkMode = () => {
      const theme = localStorage.getItem('theme')
      if (theme) {
        setIsDarkMode(theme === 'dark')
      } else {
        setIsDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches)
      }
    }

    checkDarkMode()

    const handleStorageChange = () => checkDarkMode()
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('themeChanged', handleStorageChange)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('themeChanged', handleStorageChange)
    }
  }, [])

  useEffect(() => {
    const loadData = async () => {
      const hash = window.location.hash.slice(1)
      if (!hash) {
        setLoadingState('error')
        return
      }

      const decompressed = safeDecompress(hash)
      if (!decompressed) {
        setLoadingState('error')
        return
      }

      const parsed = parseShareableChatData(decompressed)
      if (!parsed) {
        setLoadingState('error')
        return
      }

      const models = await getAIModels(false)
      const chatModel = models.find((m) => m.type === 'chat') || models[0]
      if (!chatModel) {
        setLoadingState('error')
        return
      }

      setChatData(parsed)
      setModel(chatModel)
      setLoadingState('success')
    }

    loadData()
  }, [])

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  if (loadingState === 'loading') {
    return (
      <div
        className={`flex min-h-screen items-center justify-center ${isDarkMode ? 'bg-surface-chat-background' : 'bg-white'}`}
      >
        <div className="text-content-secondary">Loading shared chat...</div>
      </div>
    )
  }

  if (loadingState === 'error' || !chatData || !model) {
    return (
      <div
        className={`flex min-h-screen items-center justify-center ${isDarkMode ? 'bg-surface-chat-background' : 'bg-white'}`}
      >
        <div className="text-center">
          <h1 className="text-2xl font-bold text-content-primary">
            Invalid Share Link
          </h1>
          <p className="mt-2 text-content-secondary">
            This share link is invalid or has been corrupted.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg bg-button-send-background px-4 py-2 text-button-send-foreground transition-opacity hover:opacity-90"
          >
            Start a new chat
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flex min-h-screen flex-col ${isDarkMode ? 'bg-surface-chat-background' : 'bg-white'}`}
    >
      <header className="border-b border-border-subtle px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-content-secondary">
                <span>Shared Chat</span>
                <span>&middot;</span>
                <span>{formatDate(chatData.createdAt)}</span>
              </div>
              <h1 className="mt-1 text-xl font-semibold text-content-primary">
                {chatData.title}
              </h1>
            </div>
            <Link
              href="/"
              className="rounded-lg bg-button-send-background px-4 py-2 text-sm font-medium text-button-send-foreground transition-opacity hover:opacity-90"
            >
              Start your own chat
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <SharedChatView
          chatData={chatData}
          isDarkMode={isDarkMode}
          model={model}
        />
      </main>

      <footer className="border-t border-border-subtle px-6 py-4">
        <div className="mx-auto max-w-3xl text-center text-sm text-content-secondary">
          <span>Powered by </span>
          <Link href="/" className="text-brand-accent-dark hover:underline">
            Tinfoil Chat
          </Link>
        </div>
      </footer>
    </div>
  )
}
