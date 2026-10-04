import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError, read } from '@/api/http'
import { useCourseStore } from '@/stores/course'
import { useDeletedFilter } from './useDeletedFilter'

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return { ...real, read: vi.fn() }
})

const deleted = new ApiError({ status: 404, code: 'not_found', message: 'deleted', details: { reason: 'deleted' } })

function setup(filter: string, listed: string[]) {
  setActivePinia(createPinia())
  const course = useCourseStore()
  course.assignments = new Map(listed.map((id) => [id, { id, title: id } as never]))
  course.assignmentsState = 'loaded'
  const assignment = ref<string | undefined>(filter)
  const scope = effectScope()
  const gone = scope.run(() => useDeletedFilter(() => 'c1', assignment))!
  return { assignment, gone, scope }
}

beforeEach(() => {
  vi.mocked(read).mockReset()
})

describe('useDeletedFilter', () => {
  it('drops a filter by an assignment deleted for good, and says so', async () => {
    vi.mocked(read).mockRejectedValue(deleted)
    const { assignment, gone, scope } = setup('asg-gone', ['hw1'])
    await flushPromises()
    expect(read).toHaveBeenCalledWith('assignment.get', { course_id: 'c1', assignment_id: 'asg-gone' })
    expect(assignment.value).toBeUndefined()
    expect(gone.value).toBe(true)
    // Choosing another takes the note away.
    assignment.value = 'hw1'
    await nextTick()
    await flushPromises()
    expect(gone.value).toBe(false)
    scope.stop()
  })

  it('asks nothing of an assignment the course lists, and keeps one it was not told was deleted', async () => {
    vi.mocked(read).mockRejectedValue(new ApiError({ status: 404, code: 'not_found', message: 'no such assignment' }))
    const listed = setup('hw1', ['hw1'])
    await flushPromises()
    expect(read).not.toHaveBeenCalled()
    expect(listed.assignment.value).toBe('hw1')
    listed.scope.stop()

    const unseen = setup('asg-hidden', ['hw1'])
    await flushPromises()
    expect(unseen.assignment.value).toBe('asg-hidden')
    expect(unseen.gone.value).toBe(false)
    unseen.scope.stop()
  })
})
