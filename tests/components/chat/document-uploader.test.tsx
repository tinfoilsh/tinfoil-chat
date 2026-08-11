import { useDocumentUploader } from '@/components/chat/document-uploader'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('useDocumentUploader', () => {
  it('waits for asynchronous persistence callbacks to finish', async () => {
    const { result } = renderHook(() => useDocumentUploader())
    let resolvePersistence!: () => void
    const onSuccess = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePersistence = resolve
        }),
    )
    let completed = false

    let uploadPromise!: Promise<void>
    act(() => {
      uploadPromise = result.current
        .handleDocumentUpload(
          new File(['Project context'], 'notes.txt', { type: 'text/plain' }),
          onSuccess,
          vi.fn(),
        )
        .then(() => {
          completed = true
        })
    })

    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledOnce())
    expect(completed).toBe(false)

    await act(async () => {
      resolvePersistence()
      await uploadPromise
    })
    expect(completed).toBe(true)
  })
})
