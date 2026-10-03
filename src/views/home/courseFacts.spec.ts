import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/http'

const read = vi.hoisted(() => vi.fn())
vi.mock('@/api/http', async (orig) => ({ ...(await orig<typeof import('@/api/http')>()), read }))

const { nextDue, readCourseFacts } = await import('./courseFacts')
type Membership = import('./courseFacts').Membership

const NOW = Date.parse('2026-10-03T08:00:00Z')
const day = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()

function seat(perms: Record<string, string>, extra: Partial<Membership> = {}): Membership {
  return {
    course_id: 'c1',
    member_id: 'm1',
    code: 'CS101',
    section: 'A',
    title: 'Introduction to Programming',
    role: 'student',
    status: 'active',
    course_status: 'active',
    answers_course: false,
    assignment_scope: 'all',
    student_scope: 'own',
    perms,
    perm_ceilings: {},
    ...extra,
  } as Membership
}
const STUDENT = { document_read: 'autonomous', action_decide: 'denied', submission_write: 'autonomous' }
const terms = Promise.resolve(new Map([['t1', '2026/27 Term 1']]))

afterEach(() => read.mockReset())

describe('the next assignment due', () => {
  it('is the published one due soonest after now', () => {
    expect(
      nextDue(
        [
          { id: 'a1', title: 'HW1', due_at: iso(NOW - day), published_at: iso(NOW - 9 * day) },
          { id: 'a2', title: 'HW2', due_at: iso(NOW + 5 * day), published_at: iso(NOW - day) },
          { id: 'a3', title: 'HW3', due_at: iso(NOW + 2 * day), published_at: iso(NOW - day) },
          { id: 'a4', title: 'Draft', due_at: iso(NOW + day), published_at: null },
          { id: 'a5', title: 'No date', due_at: null, published_at: iso(NOW - day) },
        ],
        NOW,
      ),
    ).toEqual({ id: 'a3', title: 'HW3', dueAt: iso(NOW + 2 * day) })
  })

  it('is none when nothing published is still to come', () => {
    expect(nextDue([{ id: 'a1', title: 'HW1', due_at: iso(NOW - day), published_at: iso(NOW - 9 * day) }], NOW)).toBe(
      undefined,
    )
  })
})

describe('a course’s facts on its card', () => {
  it('are its term, its next deadline and the caller’s agents’ proposals waiting, counted as its overview counts them', async () => {
    read.mockImplementation(async (tool: string) => {
      if (tool === 'course.get') return { id: 'c1', term_id: 't1' }
      if (tool === 'assignment.list')
        return { assignments: [{ id: 'a3', title: 'HW3', due_at: iso(NOW + 2 * day), published_at: iso(NOW - day) }] }
      if (tool === 'action.list_proposed')
        return {
          actions: [
            { id: 'p1', yours_to_decide: true },
            { id: 'p2', yours_to_decide: false },
          ],
          next: null,
        }
      throw new Error(tool)
    })
    expect(await readCourseFacts(seat(STUDENT), terms, NOW)).toEqual({
      term: '2026/27 Term 1',
      next: { id: 'a3', title: 'HW3', dueAt: iso(NOW + 2 * day) },
      waiting: { n: 2, more: false, agentsOnly: true },
    })
  })

  it('leave out what the seat may not read, and ask nothing waiting of an archived course', async () => {
    read.mockImplementation(async (tool: string) => {
      if (tool === 'course.get') return { id: 'c1', term_id: 'gone' }
      if (tool === 'action.list_proposed') throw new ApiError({ status: 403, code: 'forbidden', message: 'no' })
      throw new Error(tool)
    })
    expect(await readCourseFacts(seat({ document_read: 'denied' }), terms, NOW)).toEqual({})
    expect(read.mock.calls.map(([tool]) => tool)).toEqual(['course.get', 'action.list_proposed'])
    read.mockClear()
    await readCourseFacts(seat(STUDENT, { course_status: 'archived' }), terms, NOW)
    expect(read.mock.calls.map(([tool]) => tool)).not.toContain('action.list_proposed')
  })
})
