import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as Icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import GroupSetView from './GroupSetView.vue'
import MoveMenu from './components/MoveMenu.vue'
import SplitDialog from './components/SplitDialog.vue'
import { order } from './components/split'

const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'
const SET = '01a0d79f-0000-70da-a7cc-0000000000e1'
const read = vi.fn()
const write = vi.fn()
vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  read: (...a: unknown[]) => read(...a),
  write: (...a: unknown[]) => write(...a),
}))

const seat = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`
const T0 = '2026-10-05T09:00:00Z'
const g1 = seat(901)
const g2 = seat(902)

/** The set as a teacher reads it: two groups, Ana and Ben in the first, Cy in none, Dee in the second. */
function staffSet(over: Record<string, unknown> = {}) {
  return {
    id: SET,
    name: 'Project groups',
    description: 'For the term project',
    signup: { open: true, joinable: true, closes_at: null },
    created_at: T0,
    updated_at: T0,
    assignments: [{ assignment_id: 'a1', title: 'Report', published: true }],
    groups: [
      {
        id: g1,
        name: 'Group 1',
        size: 2,
        capacity: 3,
        full: false,
        created_at: T0,
        members: [
          { member_id: seat(1), display_name: 'Ana Lee', joined_how: 'assigned' },
          { member_id: seat(2), display_name: 'Ben Ho', joined_how: 'signup' },
        ],
        work: [{ assignment_id: 'a1', title: 'Report', submission_id: 's1', attempt: 1, state: 'draft' }],
      },
      {
        id: g2,
        name: 'Group 2',
        size: 1,
        full: false,
        created_at: T0,
        members: [{ member_id: seat(4), display_name: 'Dee Ng', joined_how: 'split' }],
      },
    ],
    unassigned: [{ member_id: seat(3), display_name: 'Cy Wu' }],
    unassigned_count: 1,
    ...over,
  }
}

/** The same set as Ana, a student, reads it: her own group's members alone, and no group's work. */
function studentSet(over: Record<string, unknown> = {}) {
  return {
    id: SET,
    name: 'Project groups',
    signup: { open: true, joinable: true, closes_at: '2026-10-08T15:59:00Z' },
    created_at: T0,
    updated_at: T0,
    assignments: [],
    my_group_id: g1,
    groups: [
      {
        id: g1,
        name: 'Group 1',
        size: 2,
        capacity: 3,
        full: false,
        created_at: T0,
        members: [
          { member_id: seat(1), display_name: 'Ana Lee' },
          { member_id: seat(2), display_name: 'Ben Ho' },
        ],
      },
      { id: g2, name: 'Group 2', size: 3, capacity: 3, full: true, created_at: T0 },
      { id: seat(903), name: 'Group 3', size: 0, full: false, created_at: T0 },
    ],
    ...over,
  }
}

const executed = (result: unknown) => ({
  status: 'executed',
  actionId: 'act-1',
  reviewState: 'none',
  replayed: false,
  result,
})

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  read.mockReset()
  write.mockReset()
})
const mounted: { unmount: () => void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.unstubAllGlobals()
  setLocale('en')
  document.body.innerHTML = ''
})

async function mountAs(role: 'instructor' | 'student', view: unknown) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().$patch({
    me: { id: 'actor-me', kind: 'human', display_name: role === 'student' ? 'Ana Lee' : 'Ms Chan' },
  } as never)
  const course = useCourseStore()
  course.$patch({
    courseId: COURSE,
    course: { id: COURSE, code: 'CS101', section: 'A', title: 'Programming', status: 'active' } as never,
    membership: { member_id: role === 'student' ? seat(1) : 'm-teacher', role } as never,
    perms:
      role === 'student'
        ? { document_read: 'autonomous', submission_write: 'autonomous' }
        : {
            document_read: 'autonomous',
            assignment_write: 'autonomous',
            member_read: 'autonomous',
            submission_read: 'autonomous',
          },
    permsSource: 'exact',
    membersState: 'loaded',
  } as never)
  read.mockImplementation(async (tool: string) => {
    if (tool === 'group_set.get') return structuredClone(view)
    throw new ApiError({ status: 403, code: 'forbidden', message: 'permission denied' })
  })
  const stub = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/courses/:courseId/groups', name: 'course-groups', component: stub },
      { path: '/courses/:courseId/groups/:setId', name: 'course-group-set', component: stub },
      { path: '/courses/:courseId/assignments/:assignmentId', name: 'course-assignment', component: stub },
      { path: '/courses/:courseId/submissions/:submissionId', name: 'course-submission', component: stub },
      { path: '/courses/:courseId/actions/:actionId', name: 'course-action', component: stub },
    ],
  })
  await router.push(`/courses/${COURSE}/groups/${SET}`)
  const w = mount(GroupSetView, {
    props: { courseId: COURSE, setId: SET },
    attachTo: document.body,
    global: { plugins: [pinia, i18n, ElementPlus, router], components: Icons },
  })
  mounted.push(w)
  await flushPromises()
  return w
}
const text = () => document.body.textContent ?? ''
const buttonNamed = (name: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement

describe('a set’s page, for those who form groups', () => {
  it('shows each group with its members, its size and its work, and the students in no group', async () => {
    const w = await mountAs('instructor', staffSet())
    expect(read).toHaveBeenCalledWith('group_set.get', { course_id: COURSE, set_id: SET })
    const cards = w.findAll('.group-card')
    expect(cards.map((c) => c.find('.group-card__name').text())).toEqual(['Group 1', 'Group 2'])
    expect(cards[0].find('.group-card__size').text()).toBe('2 of 3')
    expect(cards[0].findAll('.student-item__name').map((n) => n.text())).toEqual(['Ana Lee', 'Ben Ho'])
    // Who signed themselves up is said; how anyone else came is in the history.
    expect(cards[0].text()).toContain('signed up')
    expect(cards[1].text()).not.toContain('split')
    expect(cards[0].find('.group-card__work').text()).toContain('Report')
    expect(cards[0].find('.group-card__work').text()).toContain('Draft')
    expect(w.find('.set-view__none').text()).toContain('In no group: 1')
    expect(w.find('.set-view__none').text()).toContain('Cy Wu')
  })

  it('moves the students chosen with “Move to…”, and says who went where', async () => {
    const w = await mountAs('instructor', staffSet())
    const boxes = w.findAll('.student-item__check input')
    // Cy (in none) and Dee (in Group 2).
    await w.find('.set-view__none .student-item__check input').setValue(true)
    await boxes.find((b) => b.element.closest('[data-member]')?.getAttribute('data-member') === seat(4))!.setValue(true)
    expect(w.find('.set-view__chosen').text()).toBe('2 students chosen')
    write.mockResolvedValue(executed({ moved: [{ student_member_id: seat(3), group_id: g1 }], over_capacity: [] }))
    const toolbarMenu = w.findAllComponents(MoveMenu).find((m) => m.props('label') === 'Move to…')!
    toolbarMenu.vm.$emit('move', g1)
    await flushPromises()
    expect(write).toHaveBeenCalledWith(
      'group.set_members',
      {
        course_id: COURSE,
        set_id: SET,
        placements: [
          { student_member_id: seat(3), group_id: g1 },
          { student_member_id: seat(4), group_id: g1 },
        ],
        affects_work: undefined,
      },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    )
    expect(text()).toContain('Moved Cy Wu and Dee Ng to Group 1.')
    // Read again, and nobody is chosen any more.
    expect(read.mock.calls.filter(([tool]) => tool === 'group_set.get')).toHaveLength(2)
    expect(w.find('.set-view__chosen').text()).toBe('Choose students to move them.')
  })

  it('says what a move does to a group’s work, and moves them only once told to, saying so', async () => {
    const w = await mountAs('instructor', staffSet())
    write.mockRejectedValueOnce(
      new ApiError({
        status: 422,
        code: 'failed_precondition',
        message: 'a group this places students out of or into has work',
        details: {
          reason: 'group_has_work',
          work: [{ group_id: g1, assignment_id: 'a1', submission_id: 's1', state: 'draft' }],
        },
      }),
    )
    const ben = w.findAllComponents(MoveMenu).find((m) => m.props('label') === 'Move Ben Ho to…')!
    ben.vm.$emit('move', g2)
    await flushPromises()
    const dialog = document.body.querySelector('.affects-work')!
    expect(dialog.textContent).toContain('Group 1')
    expect(dialog.textContent).toContain('Report')
    expect(dialog.textContent).toContain('Draft')
    expect(dialog.textContent).toContain('A draft follows the group')
    write.mockResolvedValue(
      executed({ moved: [{ student_member_id: seat(2), from_group_id: g1, group_id: g2 }], over_capacity: [] }),
    )
    buttonNamed('Move them anyway').click()
    await flushPromises()
    expect(write).toHaveBeenLastCalledWith(
      'group.set_members',
      expect.objectContaining({ placements: [{ student_member_id: seat(2), group_id: g2 }], affects_work: true }),
      expect.anything(),
    )
  })

  it('previews a random split by the same deal, and sends the seed it showed', async () => {
    const w = await mountAs(
      'instructor',
      staffSet({
        groups: [],
        unassigned: [1, 2, 3, 4, 5].map((n) => ({ member_id: seat(n), display_name: `S${n}` })),
        unassigned_count: 5,
      }),
    )
    buttonNamed('Split at random').click()
    await flushPromises()
    const dialog = w.findComponent(SplitDialog)
    const seed = (document.body.querySelector('.split-dialog__seed-input input') as HTMLInputElement).value
    expect(seed).toMatch(/^[A-Z2-7]{12}$/)
    // Groups of up to 4: two groups, made, the five dealt in the seed's order.
    expect(dialog.text()).toContain('Places 5 students into 2 groups.')
    expect(dialog.text()).toContain('Makes Group 1 and Group 2.')
    const dealt = order([1, 2, 3, 4, 5].map(seat), seed)
    const firstGroup = [...document.body.querySelectorAll('.split-dialog__group')][0]
    expect(firstGroup.textContent).toContain(`S${Number(dealt[0].slice(-3))}`)
    write.mockResolvedValue(executed({ seed, created: [], placed: [], kept: [], emptied: 0 }))
    buttonNamed('Split').click()
    await flushPromises()
    expect(write).toHaveBeenCalledWith(
      'group.split',
      expect.objectContaining({ set_id: SET, by: 'size', n: 4, from: 'unassigned', seed, name_prefix: 'Group ' }),
      expect.anything(),
    )
    expect(text()).toContain(`Split at random, with the seed ${seed}`)
  })
})

describe('a set’s page, for a student', () => {
  it('names their own group’s members and no one else’s, and offers sign-up within capacity', async () => {
    const w = await mountAs('student', studentSet())
    expect(w.find('.student-set__mine').text()).toContain('Group 1')
    expect(w.find('.student-set__mates').text()).toContain('Ana Lee(you)')
    expect(w.find('.student-set__mates').text()).toContain('Ben Ho')
    // Nothing of a staff page: no choosing, no moving, no work, no one in no group.
    expect(w.find('.group-card').exists()).toBe(false)
    expect(w.find('.set-view__none').exists()).toBe(false)
    const rows = w.findAll('.student-set__row')
    expect(rows.map((r) => r.find('.student-set__name').text())).toEqual(['Group 1', 'Group 2', 'Group 3'])
    expect(rows[0].text()).toContain('Your group')
    expect(rows[0].find('button').text()).toBe('Leave')
    expect(rows[1].text()).toContain('3 of 3')
    expect(rows[1].text()).toContain('Full')
    expect(rows[1].find('button').attributes('disabled')).toBeDefined()
    expect(rows[2].find('button').text()).toBe('Switch here')
    expect(w.find('.signup-line').text()).toContain('left')
  })

  it('switches them to another group, and says in words why the server refused', async () => {
    const w = await mountAs('student', studentSet())
    write.mockRejectedValueOnce(
      new ApiError({
        status: 422,
        code: 'failed_precondition',
        message: 'the group is full',
        details: { reason: 'group_full', capacity: 3 },
      }),
    )
    await w.findAll('.student-set__row')[2].find('button').trigger('click')
    await flushPromises()
    expect(write).toHaveBeenCalledWith(
      'group.sign_up',
      { course_id: COURSE, set_id: SET, group_id: seat(903) },
      expect.anything(),
    )
    expect(w.find('.student-set__refusal').text()).toContain('That group is full.')
    write.mockResolvedValue(executed({ group_id: seat(903), left_group_id: g1, changed: true }))
    await w.findAll('.student-set__row')[2].find('button').trigger('click')
    await flushPromises()
    expect(text()).toContain('You switched to Group 3.')
  })

  it('says, to a student in no group with sign-up closed, that the teacher places them', async () => {
    const w = await mountAs(
      'student',
      studentSet({ my_group_id: null, signup: { open: false, joinable: false, reason: 'signup_closed' }, groups: [] }),
    )
    expect(w.find('.student-set__mine').text()).toContain('your teacher places students')
    expect(w.find('.student-set__signup').exists()).toBe(false)
  })
})
