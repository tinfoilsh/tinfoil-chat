import { SYNC_PROJECTS_INVALIDATED } from '@/constants/storage-keys'
import {
  invalidateProjects,
  projectEvents,
} from '@/services/project/project-events'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('project invalidation', () => {
  afterEach(() => {
    projectEvents.clear()
    vi.restoreAllMocks()
  })

  it('notifies the current tab and writes a cross-tab signal', () => {
    const handler = vi.fn()
    projectEvents.on('projects-invalidated', handler)

    invalidateProjects()

    expect(handler).toHaveBeenCalledWith({ type: 'projects-invalidated' })
    expect(localStorage.getItem(SYNC_PROJECTS_INVALIDATED)).toBeTruthy()
  })
})
