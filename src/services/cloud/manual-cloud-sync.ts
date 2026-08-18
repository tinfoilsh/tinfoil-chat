import type { SyncResult } from '@/services/cloud/cloud-sync'

interface ManualCloudSyncOptions {
  syncChats: () => Promise<SyncResult | false>
  syncProfile: () => Promise<boolean>
  reloadChats: () => Promise<void>
}

export async function runManualCloudSync({
  syncChats,
  syncProfile,
  reloadChats,
}: ManualCloudSyncOptions): Promise<boolean> {
  const [chatOutcome, profileOutcome] = await Promise.allSettled([
    syncChats(),
    syncProfile(),
  ])
  await reloadChats()
  if (chatOutcome.status === 'rejected') throw chatOutcome.reason
  if (profileOutcome.status === 'rejected') throw profileOutcome.reason
  return (
    chatOutcome.value !== false &&
    chatOutcome.value.errors.length === 0 &&
    profileOutcome.value
  )
}
