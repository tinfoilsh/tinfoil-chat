export const BLANK_LOCAL_QUEUE_ID = 'blank-local'
export const BLANK_CLOUD_QUEUE_ID = 'blank-cloud'

export function getBlankQueueId(isLocalOnly: boolean): string {
  return isLocalOnly ? BLANK_LOCAL_QUEUE_ID : BLANK_CLOUD_QUEUE_ID
}

export function isBlankQueueId(queueId: string): boolean {
  return queueId === BLANK_LOCAL_QUEUE_ID || queueId === BLANK_CLOUD_QUEUE_ID
}
