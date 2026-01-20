import { v4 as uuidv4 } from 'uuid'

export const MAX_REVERSE_TIMESTAMP = 9999999999999

export function generateReverseId(timestampMs: number = Date.now()): {
  id: string
  reverseTimestamp: number
  createdAtMs: number
} {
  const reverseTimestamp = MAX_REVERSE_TIMESTAMP - timestampMs
  // Left-pad to 13 digits to preserve lexicographic ordering
  const reverseTsStr = String(reverseTimestamp).padStart(13, '0')
  const id = `${reverseTsStr}_${uuidv4()}`
  return { id, reverseTimestamp, createdAtMs: timestampMs }
}
