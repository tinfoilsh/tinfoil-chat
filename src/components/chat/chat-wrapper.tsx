import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus'
import { ChatInterface } from './chat-interface'

export function ChatWrapper() {
  const { isLoading, chat_subscription_active } = useSubscriptionStatus()

  // Show loading state while checking subscription
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-gray-800">
        <div className="relative h-10 w-10">
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900"></div>
          <div className="absolute inset-0 rounded-full border-4 border-gray-200 opacity-30"></div>
        </div>
      </div>
    )
  }

  // Render a single ChatInterface with isPremium flag
  return <ChatInterface isPremium={chat_subscription_active} />
}
