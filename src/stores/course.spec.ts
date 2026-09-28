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

const { read } = await import('@/api/http')
const { useCourseStore, effectivePerms, guessPreset } = await import('./course')
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
    // The first course's seat is being read when the second is opened.
    await vi.waitFor(() =>
      expect(read).toHaveBeenCalledWith('member.get', expect.objectContaining({ course_id: 'c1' })),
    )
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

  it('takes the levels me.memberships gives as exact, and asks nothing sure to be refused', async () => {
    answers.set('me.memberships', async () => ({
      memberships: [
        {
          ...memberships[0],
          perms: { document_read: 'autonomous', conversation_ask: 'autonomous', agent_delegate: 'confirm_required' },
        },
      ],
    }))
    const session = useSessionStore()
    await session.ensure()
    const course = useCourseStore()
    vi.mocked(read).mockClear()
    await course.open('c1')
    expect(course.permsSource).toBe('exact')
    expect(course.guessedPreset).toBeNull()
    expect(course.level('conversation_ask')).toBe('autonomous')
    expect(course.needsApproval('agent_delegate')).toBe(true)
    // Not sent: denied, not unknown.
    expect(course.can('conversation_answer')).toBe(false)
    expect(course.can('member_read')).toBe(false)
    const asked = vi.mocked(read).mock.calls.map((c) => c[0])
    expect(asked).not.toContain('member.get')
    expect(asked).not.toContain('preset.list')
    expect(course.isDelegate).toBe(false)
  })

  it('still reads the seat itself where it may read the member list', async () => {
    answers.set('me.memberships', async () => ({
      memberships: [{ ...memberships[1], perms: { member_read: 'autonomous', member_manage: 'autonomous' } }],
    }))
    // The stored levels differ from the effective ones: the effective ones count.
    answers.set('member.get', async () => ({
      id: 'm2',
      perms: { member_read: 'autonomous', grade_post: 'autonomous' },
      student_scope: 'all',
      assignment_scope: 'all',
    }))
    const session = useSessionStore()
    await session.ensure()
    const course = useCourseStore()
    await course.open('c2')
    expect(course.permsSource).toBe('exact')
    expect(course.seat?.id).toBe('m2')
    expect(course.level('member_manage')).toBe('autonomous')
    expect(course.level('grade_post')).toBe('denied')
  })

  it('keeps exact levels when the seat cannot be read after all', async () => {
    answers.set('me.memberships', async () => ({
      memberships: [{ ...memberships[1], perms: { member_read: 'autonomous', document_read: 'autonomous' } }],
    }))
    answers.set('member.get', () => Promise.reject(new ApiError({ status: 500, code: 'internal', message: 'x' })))
    const session = useSessionStore()
    await session.ensure()
    const course = useCourseStore()
    await course.open('c2')
    expect(course.error).toBeNull()
    expect(course.permsSource).toBe('exact')
    expect(course.seat).toBeNull()
    expect(course.can('document_read')).toBe(true)
  })

  it('knows a delegate seat as one, and never guesses its levels from a preset', async () => {
    answers.set('me.memberships', async () => ({
      memberships: [
        { ...memberships[0], role: 'assistant', student_scope: 'listed', principal_member_id: 'owner-seat' },
      ],
    }))
    answers.set('member.get', () => Promise.reject(forbidden()))
    const session = useSessionStore()
    await session.ensure()
    const course = useCourseStore()
    await course.open('c1')
    expect(course.isDelegate).toBe(true)
    expect(course.principalMemberId).toBe('owner-seat')
    expect(course.permsSource).toBe('unknown')
    expect(course.guessedPreset).toBeNull()
    expect(course.can('document_read')).toBe(true)
    expect(course.can('member_read')).toBe(false)
  })

  it('reads the memberships again when another course is opened, so changed levels show', async () => {
    let level = 'denied'
    answers.set('me.memberships', async () => ({
      memberships: memberships.map((m) => ({ ...m, perms: { conversation_ask: level } })),
    }))
    const session = useSessionStore()
    await session.ensure()
    const course = useCourseStore()
    await course.open('c1', true)
    expect(course.can('conversation_ask')).toBe(false)
    level = 'autonomous'
    await course.open('c2', true)
    expect(course.can('conversation_ask')).toBe(true)
  })
})

describe('effectivePerms', () => {
  it('is null from a Core that does not send them', () => {
    expect(effectivePerms(null)).toBeNull()
    expect(effectivePerms({} as never)).toBeNull()
  })
  it('fills every permission, denying what is missing or unknown', () => {
    const p = effectivePerms({ perms: { document_read: 'autonomous', grade_read: 'sometimes' } })!
    expect(p.document_read).toBe('autonomous')
    expect(p.grade_read).toBe('denied')
    expect(p.conversation_answer).toBe('denied')
    // From a Core before invite links, which says nothing of member_invite.
    expect(p.member_invite).toBe('denied')
    expect(Object.keys(p)).toHaveLength(17)
  })
})

describe('whether a person who decides nothing here owns an agent seated here', () => {
  const student = {
    ...memberships[0],
    perms: { document_read: 'autonomous', submission_write: 'autonomous', action_decide: 'denied' },
  }
  async function openAs(kind: string, seat: Record<string, unknown>) {
    answers.set('me.get', async () => ({ id: 'a1', kind, display_name: 'Mei' }))
    answers.set('me.memberships', async () => ({ memberships: [seat] }))
    const session = useSessionStore()
    await session.ensure()
    // The same tab, signed in as someone else of this kind.
    session.me = { ...session.me!, kind }
    await session.loadMemberships()
    const course = useCourseStore()
    vi.mocked(read).mockClear()
    await course.open('c1')
    await new Promise((r) => setTimeout(r, 0))
    return course
  }
  const asked = () => vi.mocked(read).mock.calls.filter((c) => c[0] === 'action.list_proposed')

  it('asks the queue, which Core shows such an owner and refuses anyone else', async () => {
    answers.set('action.list_proposed', async () => ({ actions: [] }))
    const course = await openAs('human', student)
    expect(asked()).toEqual([['action.list_proposed', { course_id: 'c1', limit: 1 }]])
    expect(course.ownsAgentHere).toBe(true)
  })

  it('takes a refusal for no, and anything else for not known', async () => {
    answers.set('action.list_proposed', () => Promise.reject(forbidden()))
    let course = await openAs('human', student)
    expect(course.ownsAgentHere).toBe(false)
    course.close()
    answers.set('action.list_proposed', () =>
      Promise.reject(new ApiError({ status: 0, code: 'network', message: 'offline' })),
    )
    course = await openAs('human', student)
    expect(course.ownsAgentHere).toBeNull()
  })

  it('does not ask for a seat that decides anyway, nor for an agent', async () => {
    answers.set('action.list_proposed', async () => ({ actions: [] }))
    let course = await openAs('human', { ...student, perms: { ...student.perms, action_decide: 'confirm_required' } })
    expect(asked()).toEqual([])
    expect(course.ownsAgentHere).toBeNull()
    course.close()
    course = await openAs('agent', student)
    expect(asked()).toEqual([])
    expect(course.ownsAgentHere).toBeNull()
  })
})

describe('guessPreset', () => {
  const seat = (role: string, student_scope = 'all', assignment_scope = 'all', principal_member_id?: string) => ({
    role,
    student_scope,
    assignment_scope,
    principal_member_id,
  })
  it('names people by their role', () => {
    expect(guessPreset(seat('student'))).toBe('student')
    expect(guessPreset(seat('instructor'))).toBe('instructor')
  })
  it('tells the old agent presets apart by scope', () => {
    expect(guessPreset(seat('assistant', 'all', 'listed'))).toBe('grader')
    expect(guessPreset(seat('assistant', 'listed', 'all'))).toBe('tutor')
    expect(guessPreset(seat('assistant', 'all', 'all'))).toBeNull()
  })
  it('never guesses a delegate, whatever its shape', () => {
    expect(guessPreset(seat('assistant', 'listed', 'all', 'p'))).toBeNull()
    expect(guessPreset(seat('assistant', 'all', 'listed', 'p'))).toBeNull()
  })
})
