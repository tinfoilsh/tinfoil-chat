'use client'

import { initializeRenderers } from '@/components/chat/renderers/client'
import { SharedChatView } from '@/components/chat/shared-chat-view'
import { getAIModels, type BaseModel } from '@/config/models'
import { fetchSharedChat } from '@/services/share-api'
import {
  validateShareableChatData,
  type ShareableChatData,
} from '@/utils/compression'
import { decryptShare } from '@/utils/share-encryption'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'

type LoadingState = 'loading' | 'error' | 'success'

export default function SharePage() {
  const router = useRouter()
  const [loadingState, setLoadingState] = useState<LoadingState>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
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
    if (!router.isReady) return

    const loadData = async () => {
      const slug = router.query.slug
      const parts =
        typeof slug === 'string' ? [slug] : Array.isArray(slug) ? slug : []
      const chatId = parts[0]

      if (!chatId) {
        setErrorMessage('No chat ID provided')
        setLoadingState('error')
        return
      }

      const keyBase64url = window.location.hash.slice(1)
      if (!keyBase64url) {
        setErrorMessage('Missing decryption key')
        setLoadingState('error')
        return
      }

      try {
        const encryptedData = await fetchSharedChat(chatId)
        const decrypted = await decryptShare(encryptedData, keyBase64url)

        if (!decrypted) {
          setErrorMessage('Failed to decrypt chat data')
          setLoadingState('error')
          return
        }

        const parsed = validateShareableChatData(decrypted)
        if (!parsed) {
          setErrorMessage('Invalid chat data format')
          setLoadingState('error')
          return
        }

        const models = await getAIModels(false)
        const chatModel = models.find((m) => m.type === 'chat') || models[0]
        if (!chatModel) {
          setErrorMessage('Failed to load model configuration')
          setLoadingState('error')
          return
        }

        setChatData(parsed)
        setModel(chatModel)
        setLoadingState('success')
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === 'Shared chat not found'
        ) {
          setErrorMessage('This shared chat does not exist or has been deleted')
        } else {
          setErrorMessage('Failed to load shared chat')
        }
        setLoadingState('error')
      }
    }

    loadData()
  }, [router.isReady, router.query.slug])

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
            {errorMessage ||
              'This share link is invalid or has been corrupted.'}
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
