import { MAX_REVERSE_TIMESTAMP, generateReverseId } from '@/utils/reverse-id'
import { describe, expect, it } from 'vitest'

describe('generateReverseId', () => {
  it('generates {13-digit reverseTs}_{uuidv4}', () => {
    const { id, reverseTimestamp, createdAtMs } = generateReverseId(0)
    expect(createdAtMs).toBe(0)
    expect(reverseTimestamp).toBe(MAX_REVERSE_TIMESTAMP)

    const [ts, uuid] = id.split('_')
    expect(ts).toBe(String(MAX_REVERSE_TIMESTAMP).padStart(13, '0'))
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('reverseTimestamp decreases as time increases', () => {
    const a = generateReverseId(1000)
    const b = generateReverseId(2000)
    expect(b.reverseTimestamp).toBeLessThan(a.reverseTimestamp)
  })
})
