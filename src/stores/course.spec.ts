import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '@/api/http'

// Every read goes through this, answered per test.
const answers = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>()
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn((tool: string, args: Record<string, unknown>) => {
      const a = answers.get(tool)
      if (!a) return Promise.reject(new Error(`no answer for ${tool}`))
      return a(args)
    }),
    logout: vi.fn(() => Promise.resolve()),
  }
})

const { useCourseStore } = await import('./course')
const { useSessionStore } = await import('./session')

const forbidden = () => new ApiError({ status: 403, code: 'forbidden', message: 'no' })

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const memberships = [
  {
    course_id: 'c1',
    member_id: 'm1',
    role: 'student',
    status: 'active',
    student_scope: 'all',
    assignment_scope: 'all',
  },
  {
    course_id: 'c2',
    member_id: 'm2',
    role: 'instructor',
    status: 'active',
    student_scope: 'all',
    assignment_scope: 'all',
  },
]

beforeEach(() => {
  setActivePinia(createPinia())
  answers.clear()
  answers.set('me.get', async () => ({ id: 'a1', display_name: 'Yuki', platform_role: 'user' }))
  answers.set('me.memberships', async () => ({ memberships }))
  answers.set('course.get', async (a) => ({ id: a.course_id, code: String(a.course_id), title: 'T', status: 'active' }))
  answers.set('preset.list', async () => ({ presets: [{ name: 'student', perms: { document_read: 'autonomous' } }] }))
})

describe('course store', () => {
  it('does not carry a late refusal from the course left behind into the one open now', async () => {
    const late = deferred<unknown>()
    answers.set('member.get', (a) =>
      a.course_id === 'c1'
        ? late.promise
        : Promise.resolve({ id: 'm2', perms: { member_read: 'autonomous', grade_post: 'autonomous' } }),
    )
    const session = useSessionStore()
    await session.ensure()
    const course = useCourseStore()
    const first = course.open('c1')
    await vi.waitFor(() => expect(course.courseId).toBe('c1'))
    await course.open('c2')
    late.reject(forbidden())
    await first
    expect(course.courseId).toBe('c2')
    expect(course.permsSource).toBe('exact')
    expect([...course.refused]).toEqual([])
    expect(course.level('member_read')).toBe('autonomous')
    expect(course.membership?.member_id).toBe('m2')
  })

  it('forgets the seat when the caller signs out, and reads it again for the next one', async () => {
    answers.set('member.get', async () => ({ id: 'm2', perms: { member_read: 'autonomous' } }))
    const session = useSessionStore()
    await session.ensure()
    const course = useCourseStore()
    await course.open('c2')
    expect(course.role).toBe('instructor')

    await session.signOut()
    expect(course.courseId).toBeNull()
    expect(course.course).toBeNull()
    expect(course.membership).toBeNull()
    expect(course.permsSource).toBe('unknown')
    expect(session.startsAfresh()).toBe(true)

    // Someone else, seated as a student in the same course, opens it.
    answers.set('me.memberships', async () => ({
      memberships: [{ ...memberships[1], member_id: 'm9', role: 'student' }],
    }))
    answers.set('member.get', () => Promise.reject(forbidden()))
    answers.set('login', async () => ({}))
    session.status = 'unknown'
    await session.ensure()
    await course.open('c2')
    expect(course.role).toBe('student')
    expect(course.myMemberId).toBe('m9')
    expect(course.permsSource).toBe('preset')
    expect(course.can('grade_post')).toBe(false)
  })
})
