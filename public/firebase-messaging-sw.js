/**
 * Service worker for stream-completion push notifications.
 *
 * FCM delivers data-only messages, so this worker renders notifications
 * itself via the standard Web Push `push` event instead of importing the
 * Firebase SDK. The page passes its own registration of this worker to
 * FCM's getToken(), which binds the push subscription here.
 *
 * Payload data shape (set by the controlplane):
 *   { type: 'stream-finished', chatId, title, body, success }
 */

/**
 * Validates the chat identifier used to build the deep-link path. Chat IDs
 * are `<digits>_<uuid>` (optionally prefixed with `local/` for local-only
 * chats); anything else - path traversal, query strings, absolute URLs - is
 * rejected so a forged payload cannot steer navigation.
 */
function sanitizedChatId(raw) {
  if (typeof raw !== 'string') return null
  const match = /^(local\/)?[0-9A-Za-z_-]{1,64}$/.exec(raw)
  return match ? raw : null
}

/** True when a focused window is already showing the chat. */
async function chatIsVisible(chatId) {
  const windows = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })
  return windows.some((client) => {
    if (client.visibilityState !== 'visible' || !client.focused) return false
    return new URL(client.url).pathname.endsWith(`/chat/${chatId}`)
  })
}

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    return
  }
  const data = payload?.data
  if (data?.type !== 'stream-finished') return
  const chatId = sanitizedChatId(data.chatId)
  if (!chatId) return

  event.waitUntil(
    (async () => {
      // The user is already looking at this chat: the finished response is
      // on screen, so an OS notification would only be noise.
      if (await chatIsVisible(chatId)) return

      await self.registration.showNotification(
        data.title || 'Your response is ready',
        {
          body: data.body || '',
          icon: '/android-chrome-192x192.png',
          badge: '/favicon-32x32.png',
          tag: `stream-finished-${chatId}`,
          data: { chatId },
        },
      )
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Re-validated even though showNotification only stores sanitized IDs:
  // notification data survives SW updates, so don't trust old payloads.
  const chatId = sanitizedChatId(event.notification.data?.chatId)
  if (!chatId) return

  const chatPath = `/chat/${chatId}`
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      const existing = windows.find((client) =>
        new URL(client.url).pathname.endsWith(chatPath),
      )
      if (existing) {
        await existing.focus()
        return
      }
      await self.clients.openWindow(chatPath)
    })(),
  )
})
