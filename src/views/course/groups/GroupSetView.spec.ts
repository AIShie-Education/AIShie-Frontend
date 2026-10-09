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

async function mountAs(
  role: 'instructor' | 'student' | 'ta',
  view: unknown,
  seatOver: { perms?: Record<string, string>; student_scope?: string; assignment_scope?: string } = {},
) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().$patch({
    me: { id: 'actor-me', kind: 'human', display_name: role === 'student' ? 'Ana Lee' : 'Ms Chan' },
  } as never)
  const course = useCourseStore()
  course.$patch({
    courseId: COURSE,
    course: { id: COURSE, code: 'CS101', section: 'A', title: 'Programming', status: 'active' } as never,
    membership: {
      member_id: role === 'student' ? seat(1) : 'm-teacher',
      role,
      student_scope: seatOver.student_scope ?? 'all',
      assignment_scope: seatOver.assignment_scope ?? 'all',
    } as never,
    perms:
      seatOver.perms ??
      (role === 'student'
        ? { document_read: 'autonomous', submission_write: 'autonomous' }
        : {
            document_read: 'autonomous',
            assignment_write: 'autonomous',
            member_read: 'autonomous',
            submission_read: 'autonomous',
          }),
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
/**
 * The focus falls back to the page, as a browser drops it from a button that
 * is turned off (jsdom keeps it there): an element focused and taken away.
 */
function loseFocus() {
  const gone = document.createElement('button')
  document.body.appendChild(gone)
  gone.focus()
  gone.remove()
}
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

describe('a random split, where the seat is not shown all it deals over', () => {
  const former = { perms: { document_read: 'autonomous', assignment_write: 'autonomous', member_read: 'autonomous' } }

  it('is not offered to a seat listed to some students: it deals every student of the course', async () => {
    const w = await mountAs('ta', staffSet(), { ...former, student_scope: 'listed' })
    expect(buttonNamed('Split at random')).toBeUndefined()
    expect(w.findComponent(SplitDialog).exists()).toBe(false)
    // Placing by hand, and adding groups, are still offered.
    expect(buttonNamed('Add groups')).toBeDefined()
    expect(w.find('.student-item__check').exists()).toBe(true)
  })

  it('says to such a seat that the set has no groups yet, and not to split the class', async () => {
    await mountAs('ta', staffSet({ groups: [] }), { ...former, student_scope: 'listed' })
    expect(text()).toContain('This set has no groups yet: add some.')
    expect(text()).not.toContain('split the class at random')
  })

  it('shows no deal to a seat not shown every assignment’s work, says why, and sends the seed it shows', async () => {
    // Group 1 has a draft for an assignment this seat is not listed for: it is not shown, and the server keeps the group.
    const view = staffSet()
    delete (view.groups[0] as { work?: unknown }).work
    const w = await mountAs('ta', view, { ...former, assignment_scope: 'listed' })
    buttonNamed('Split at random').click()
    await flushPromises()
    const dialog = w.findComponent(SplitDialog)
    expect(dialog.text()).toContain('What it deals cannot be shown before it is made')
    expect(dialog.text()).toContain('you are not shown all of them')
    expect(dialog.text()).not.toContain('what is shown below is what is dealt')
    expect(dialog.text()).not.toContain('Places')
    expect(document.body.querySelector('.split-dialog__group')).toBeNull()
    const seed = (document.body.querySelector('.split-dialog__seed-input input') as HTMLInputElement).value
    write.mockResolvedValue(
      executed({ seed, created: [], placed: [], kept: [{ group_id: g1, reason: 'has_work' }], emptied: 0 }),
    )
    buttonNamed('Split').click()
    await flushPromises()
    expect(write).toHaveBeenCalledWith('group.split', expect.objectContaining({ set_id: SET, seed }), expect.anything())
    // What was dealt is said once it is made.
    expect(text()).toContain('Left Group 1 alone')
  })

  it('shows no deal to a seat that does not read the member list, which names nobody', async () => {
    const view = staffSet({ unassigned: null, unassigned_count: null })
    for (const g of view.groups) delete (g as { members?: unknown }).members
    const w = await mountAs('ta', view, { perms: { document_read: 'autonomous', assignment_write: 'autonomous' } })
    buttonNamed('Split at random').click()
    await flushPromises()
    expect(w.findComponent(SplitDialog).text()).toContain('What it deals cannot be shown before it is made')
    expect((buttonNamed('Split') as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('those in no group, to a seat listed to some students', () => {
  const former = { perms: { document_read: 'autonomous', assignment_write: 'autonomous', member_read: 'autonomous' } }

  it('are counted as those the seat reaches, never as everyone', async () => {
    // Core counts only the students the seat reaches: Ada, whom it lists, is in a group; whoever else is in none.
    const w = await mountAs('ta', staffSet({ unassigned: [], unassigned_count: 0 }), {
      ...former,
      student_scope: 'listed',
    })
    expect(w.find('.set-view__none').text()).toBe('Every student you reach is in a group.')
    expect(text()).not.toContain('Everyone is in a group')
  })

  it('says how many of those it reaches are in none, in Traditional Chinese too', async () => {
    const w = await mountAs('ta', staffSet(), { ...former, student_scope: 'listed' })
    expect(w.find('.set-view__none-title').text()).toBe('Students you reach in no group: 1')
    w.unmount()
    setLocale('zh-Hant')
    const zh = await mountAs('ta', staffSet({ unassigned: [], unassigned_count: 0 }), {
      ...former,
      student_scope: 'listed',
    })
    expect(zh.find('.set-view__none').text()).toBe('你權限範圍內的學生均已分組。')
  })

  it('are all of them, to a seat that reaches every student', async () => {
    const w = await mountAs('instructor', staffSet({ unassigned: [], unassigned_count: 0 }))
    expect(w.find('.set-view__none').text()).toBe('Everyone is in a group.')
  })
})

describe('where the focus goes once students are moved', () => {
  it('to the moved student’s own menu in the group they are in now, after their row’s menu', async () => {
    const w = await mountAs('instructor', staffSet())
    write.mockResolvedValue(executed({ moved: [{ student_member_id: seat(3), group_id: g2 }], over_capacity: [] }))
    const moved = staffSet()
    moved.groups[1].members!.push({ member_id: seat(3), display_name: 'Cy Wu', joined_how: 'assigned' })
    moved.groups[1].size = 2
    moved.unassigned = []
    moved.unassigned_count = 0
    read.mockImplementation(async () => structuredClone(moved))
    const cy = w.findAllComponents(MoveMenu).find((m) => m.props('label') === 'Move Cy Wu to…')!
    cy.vm.$emit('move', g2)
    await flushPromises()
    const focused = document.activeElement as HTMLElement
    expect(focused.tagName).toBe('BUTTON')
    expect(focused.getAttribute('aria-label')).toBe('Move Cy Wu to…')
    expect(focused.closest('[data-group]')?.getAttribute('data-group')).toBe(g2)
  })

  it('to the group the students chosen went to, after “Move to…”, which is off with nobody chosen', async () => {
    const w = await mountAs('instructor', staffSet())
    await w.find('.set-view__none .student-item__check input').setValue(true)
    write.mockResolvedValue(executed({ moved: [{ student_member_id: seat(3), group_id: g1 }], over_capacity: [] }))
    const toolbarMenu = w.findAllComponents(MoveMenu).find((m) => m.props('label') === 'Move to…')!
    toolbarMenu.vm.$emit('move', g1)
    await flushPromises()
    expect(document.activeElement?.id).toBe(`group-${g1}`)
    expect(document.activeElement?.textContent).toBe('Group 1')
    // Out of every group: to those in no group.
    await w.findAll('.group-card .student-item__check input')[0].setValue(true)
    write.mockResolvedValue(executed({ moved: [{ student_member_id: seat(1) }], over_capacity: [] }))
    toolbarMenu.vm.$emit('move', null)
    await flushPromises()
    expect(document.activeElement?.id).toBe('set-view-none')
  })

  it('to the request, where the move waits for approval', async () => {
    const w = await mountAs('instructor', staffSet())
    await w.find('.set-view__none .student-item__check input').setValue(true)
    write.mockResolvedValue({ status: 'proposed', actionId: 'act-9' })
    const toolbarMenu = w.findAllComponents(MoveMenu).find((m) => m.props('label') === 'Move to…')!
    toolbarMenu.vm.$emit('move', g1)
    await flushPromises()
    expect(document.activeElement?.textContent?.trim()).toBe('View the request')
  })
})

describe('a set’s page, for staff who neither form groups nor read the member list', () => {
  it('shows the groups read only, and never offers sign-up', async () => {
    // A teaching assistant whose member list was taken away: the server names nobody to them, and shows no work.
    const view = staffSet({ unassigned: null, unassigned_count: null })
    for (const g of view.groups) {
      delete (g as { members?: unknown }).members
      delete (g as { work?: unknown }).work
    }
    const w = await mountAs('ta', view, { perms: { document_read: 'autonomous', grade_submit: 'autonomous' } })
    expect(w.find('.student-set__mine').exists()).toBe(false)
    expect(text()).not.toContain('You are in no group')
    expect(text()).not.toContain('Join')
    const cards = w.findAll('.group-card')
    expect(cards.map((c) => c.find('.group-card__size').text())).toEqual(['2 of 3', '1 student'])
    expect(text()).not.toContain('you do not reach')
    expect(text()).toContain('Who is in each group is shown to those who may read the member list.')
    expect(w.find('.student-item__check').exists()).toBe(false)
    expect(w.find('.group-card__more').exists()).toBe(false)
  })
})

describe('archiving a group', () => {
  it('asks no more than that, of a reader shown every group’s work', async () => {
    const view = staffSet()
    view.groups.push({ id: seat(905), name: 'Group 5', size: 0, full: false, created_at: T0, members: [] } as never)
    const w = await mountAs('instructor', view)
    const card = w.findAll('.group-card').find((c) => c.find('.group-card__name').text() === 'Group 5')!
    card.findComponent({ name: 'ElDropdown' }).vm.$emit('command', 'archive')
    await flushPromises()
    const box = document.body.querySelector('.el-message-box')!
    expect(box.textContent).toContain('Group 5 is hidden from this set and from sign-up.')
    expect(box.textContent).not.toContain('you are not shown')
  })

  it('says, to a reader not shown every group’s work, that one with work they are not shown stays, and words the refusal for them', async () => {
    const view = staffSet()
    view.groups.push({ id: seat(905), name: 'Group 5', size: 0, full: false, created_at: T0, members: [] } as never)
    const w = await mountAs('instructor', view, {
      student_scope: 'listed',
      perms: { document_read: 'autonomous', assignment_write: 'autonomous', member_read: 'autonomous' },
    })
    const card = w.findAll('.group-card').find((c) => c.find('.group-card__name').text() === 'Group 5')!
    card.findComponent({ name: 'ElDropdown' }).vm.$emit('command', 'archive')
    await flushPromises()
    const box = document.body.querySelector('.el-message-box')!
    expect(box.textContent).toContain('Group 5 is hidden from this set and from sign-up.')
    expect(box.textContent).toContain('If it has work for an assignment of this set that you are not shown')
    write.mockRejectedValueOnce(
      new ApiError({
        status: 422,
        code: 'failed_precondition',
        message: 'the group has work for an assignment of its set, and is kept as it is',
        details: { reason: 'group_has_work', work: [{ group_id: seat(905), assignment_id: 'a1', state: 'draft' }] },
      }),
    )
    buttonNamed('Archive group').click()
    await flushPromises()
    expect(write).toHaveBeenCalledWith(
      'group.update',
      { course_id: COURSE, group_id: seat(905), archived: true },
      expect.anything(),
    )
    expect(text()).toContain('That group has work for an assignment of this set, if only a draft')
    expect(text()).not.toContain('handed work in')
    expect(text()).not.toContain('your teacher')
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

  it('gives the focus back to the group’s button once a sign-up is answered, which was off while it was asked for', async () => {
    const w = await mountAs('student', studentSet())
    const button = () => w.find(`.student-set__row[data-group="${seat(903)}"] button`)
    // Ana switches to Group 3 from the keyboard; the set read again has her there.
    const switched = studentSet({ my_group_id: seat(903) })
    let answer = (_v: unknown) => {}
    write.mockImplementation(() => new Promise((r) => (answer = r)))
    read.mockImplementation(async () => structuredClone(switched))
    ;(button().element as HTMLButtonElement).focus()
    await button().trigger('click')
    // While it is asked for, every button is off, and the browser takes the focus from the one pressed.
    expect(button().attributes('disabled')).toBeDefined()
    loseFocus()
    expect(document.activeElement).toBe(document.body)
    answer(executed({ group_id: seat(903), left_group_id: g1, changed: true }))
    await flushPromises()
    expect(text()).toContain('You switched to Group 3.')
    expect(button().text()).toBe('Leave')
    expect(document.activeElement).toBe(button().element)
  })

  it('gives the focus to “Your group” where the group’s button is off once the set is read again', async () => {
    const w = await mountAs('student', studentSet())
    const button = () => w.find(`.student-set__row[data-group="${seat(903)}"] button`)
    // Group 3 filled up meanwhile: Core refuses, and the set read again says it is full.
    const full = studentSet()
    full.groups[2] = { ...full.groups[2], size: 3, capacity: 3, full: true } as never
    read.mockImplementation(async () => structuredClone(full))
    let refuse = (_e: unknown) => {}
    write.mockImplementation(() => new Promise((_r, j) => (refuse = j)))
    ;(button().element as HTMLButtonElement).focus()
    await button().trigger('click')
    loseFocus()
    refuse(
      new ApiError({ status: 422, code: 'failed_precondition', message: 'full', details: { reason: 'group_full' } }),
    )
    await flushPromises()
    expect(w.find('.student-set__refusal').text()).toContain('That group is full.')
    expect(button().attributes('disabled')).toBeDefined()
    expect(document.activeElement?.id).toBe('student-set-mine')
  })

  it('leaves the focus where the student has gone meanwhile', async () => {
    const w = await mountAs('student', studentSet())
    const button = () => w.find(`.student-set__row[data-group="${seat(903)}"] button`)
    let answer = (_v: unknown) => {}
    write.mockImplementation(() => new Promise((r) => (answer = r)))
    await button().trigger('click')
    const elsewhere = document.createElement('input')
    document.body.appendChild(elsewhere)
    elsewhere.focus()
    answer(executed({ group_id: seat(903), left_group_id: g1, changed: true }))
    await flushPromises()
    expect(document.activeElement).toBe(elsewhere)
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
