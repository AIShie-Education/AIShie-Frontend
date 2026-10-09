import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { i18n, setLocale } from '@/i18n'
import { useCourseStore } from '@/stores/course'
import GroupRoster from './GroupRoster.vue'
import type { RosterGroup } from './rosterByGroup'
import type { RosterEntry } from './roster'

// Every write asked for, and what Core answers it with; every read, and the group set's sizes.
let writes: { tool: string; args: Record<string, unknown> }[] = []
let reads: string[] = []
let sizes: Record<string, number> = {}
/** The works submission.get reads, by id. */
let works: Record<string, Record<string, unknown>> = {}
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      reads.push(tool)
      if (tool === 'group_set.get' && args.set_id === 'set-gone')
        throw new real.ApiError({ status: 404, code: 'not_found', message: 'no such group set' })
      if (tool === 'group_set.get')
        return {
          id: 'set-1',
          name: 'Project groups',
          groups: Object.entries(sizes).map(([id, size]) => ({ id, size })),
        }
      if (tool === 'submission.get' && works[args.submission_id as string]) return works[args.submission_id as string]
      throw new Error(`no answer for ${tool}`)
    }),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      return { status: 'executed', actionId: 'act-1', reviewState: 'none', result: { submission_id: 's-new' } }
    }),
  }
})
const confirm = vi.fn(async (..._a: unknown[]) => 'confirm')
vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return {
    ...real,
    ElMessage: vi.fn(),
    ElNotification: vi.fn(),
    ElMessageBox: { ...real.ElMessageBox, confirm: (...a: unknown[]) => confirm(...a) },
  }
})

const COURSE = 'c1'
const ASSIGNMENT = 'asg-1'
const groups: RosterGroup[] = [
  {
    group_id: 'g-beta',
    name: 'Beta',
    members: [
      { member_id: 'm-ken', display_name: 'Ken Wong' },
      { member_id: 'm-mei', display_name: 'Mei Chan' },
    ],
    state: 'submitted',
    submission_id: 's-b',
    attempt: 1,
    submitted_at: '2026-10-05T12:00:00Z',
    submitted_by_member_id: 'm-mei',
  },
  {
    group_id: 'g-alpha',
    name: 'Alpha',
    members: [{ member_id: 'm-yuki', display_name: 'Yuki Tanaka' }],
    state: 'late',
    submission_id: 's-a',
    attempt: 1,
    submitted_at: '2026-10-05T11:00:00Z',
    submitted_by_member_id: 'm-yuki',
  },
  { group_id: 'g-gamma', name: 'Gamma', members: [{ member_id: 'm-fay', display_name: 'Fay' }], state: 'not_started' },
  { group_id: 'g-empty', name: 'Delta', members: [], state: 'not_started' },
]
const rows: RosterEntry[] = [
  {
    student_member_id: 'm-yuki',
    display_name: 'Yuki Tanaka',
    group_id: 'g-alpha',
    state: 'late',
    submission_id: 's-a',
  },
  { student_member_id: 'm-ken', display_name: 'Ken Wong', group_id: 'g-beta', state: 'late', submission_id: 's-a' },
  {
    student_member_id: 'm-mei',
    display_name: 'Mei Chan',
    group_id: 'g-beta',
    state: 'submitted',
    submission_id: 's-b',
  },
  { student_member_id: 'm-fay', display_name: 'Fay', group_id: 'g-gamma', state: 'not_started' },
  { student_member_id: 'm-eve', display_name: 'Eve', member_status: 'paused', state: 'no_group' },
]

beforeEach(() => {
  // jsdom has no matchMedia, which the UI store (for the theme) asks.
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener() {},
    removeEventListener() {},
  }))
  setLocale('en')
  writes = []
  reads = []
  sizes = {}
  works = {}
  confirm.mockClear()
})
afterEach(() => {
  document.body.innerHTML = ''
})

/** The teacher's seat, which reaches every student; or a TA's, listed to some. */
const TEACHER = { member_id: 'm-sato', role: 'instructor', status: 'active', student_scope: 'all' }
async function mountRoster(
  props: Partial<InstanceType<typeof GroupRoster>['$props']> = {},
  seat: Record<string, unknown> = TEACHER,
) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const course = useCourseStore()
  course.membership = seat as never
  course.assignments = new Map([
    [ASSIGNMENT, { id: ASSIGNMENT, title: 'Group essay', points_possible: 10, published_at: '2026-10-01T00:00:00Z' }],
  ]) as never
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', name: 'course-submission', component: { render: () => null } }],
  })
  const wrapper = mount(GroupRoster, {
    props: {
      courseId: COURSE,
      assignmentId: ASSIGNMENT,
      setId: 'set-1',
      groups,
      rows,
      loading: false,
      error: null,
      hasMore: false,
      ...props,
    },
    attachTo: document.body,
    global: { plugins: [pinia, router, i18n, ElementPlus], components: icons },
  })
  await flushPromises()
  return wrapper
}

const rowOf = (w: Awaited<ReturnType<typeof mountRoster>>, name: string) =>
  w.findAll('.group-roster__table .el-table__row').find((r) => r.text().includes(name))!

describe('the roster by group', () => {
  it('lists each group with its members now, where its work stands, and who handed it in, by name', async () => {
    const w = await mountRoster()
    const names = w.findAll('.group-roster__table .el-table__row .group-roster__name').map((n) => n.text())
    expect(names).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma'])
    expect(rowOf(w, 'Beta').text()).toContain('Ken Wong and Mei Chan')
    expect(rowOf(w, 'Beta').text()).toContain('by Mei Chan')
    expect(rowOf(w, 'Delta').text()).toContain('Nobody in it')
    // Ken moved to Beta: Alpha's work is still his, and Beta's is not.
    expect(rowOf(w, 'Alpha').text()).toContain('Handed in for Ken Wong and Yuki Tanaka')
    expect(rowOf(w, 'Beta').text()).toContain('Handed in for Mei Chan')
    w.unmount()
  })

  it('says who is in no group, and that they are not recorded as missing', async () => {
    const w = await mountRoster()
    const none = w.find('.group-roster__no-group')
    expect(none.text()).toContain('In no group: 1 student')
    expect(none.text()).toContain('are not recorded as missing')
    expect(none.text()).toContain('Eve')
    expect(none.text()).toContain('Paused')
    w.unmount()
  })

  it('records a group with someone in it and no work as missing, for its members now', async () => {
    const w = await mountRoster()
    expect(rowOf(w, 'Delta').find('button').exists()).toBe(false)
    expect(rowOf(w, 'Alpha').find('button').exists()).toBe(false)
    await rowOf(w, 'Gamma').find('button').trigger('click')
    await flushPromises()
    const [message, title] = confirm.mock.calls[0] as [{ children: { children: string }[] }, string]
    expect(title).toBe('Record Gamma as missing?')
    expect(message.children[0]!.children).toContain('for its members now: Fay')
    expect(writes).toEqual([
      {
        tool: 'submission.record_missing',
        args: { course_id: COURSE, assignment_id: ASSIGNMENT, group_id: 'g-gamma' },
      },
    ])
    expect(w.emitted('changed')).toHaveLength(1)
    w.unmount()
  })

  it('to a seat that reaches every student, records missing without reading the set', async () => {
    const w = await mountRoster()
    expect(reads).toEqual([])
    expect(rowOf(w, 'Gamma').find('button').exists()).toBe(true)
    w.unmount()
  })

  it('to a TA listed to some students, records missing only a group whose every member they reach', async () => {
    // Listed for Fay and Zed: Gamma has Fay alone, the roster says; its set says it has Fay and Ken now.
    // Zeta has Zed alone, as its set says too.
    sizes = { 'g-gamma': 2, 'g-zeta': 1, 'g-alpha': 1 }
    const zeta = {
      group_id: 'g-zeta',
      name: 'Zeta',
      members: [{ member_id: 'm-zed', display_name: 'Zed Ng' }],
      state: 'not_started',
    }
    const ta = { member_id: 'm-ta', role: 'ta', status: 'active', student_scope: 'listed' }
    const listed: RosterEntry[] = [
      { student_member_id: 'm-fay', display_name: 'Fay', group_id: 'g-gamma', state: 'not_started' },
      { student_member_id: 'm-zed', display_name: 'Zed Ng', group_id: 'g-zeta', state: 'not_started' },
    ]
    const w = await mountRoster({ groups: [groups[2]!, zeta], rows: listed }, ta)
    expect(reads).toEqual(['group_set.get'])
    expect(rowOf(w, 'Gamma').find('button').exists()).toBe(false)
    expect(rowOf(w, 'Gamma').text()).toContain(
      '1 more member your seat does not reach, so someone whose seat reaches every member records the group as missing',
    )
    expect(rowOf(w, 'Zeta').find('.group-roster__unreached').exists()).toBe(false)
    await rowOf(w, 'Zeta').find('button').trigger('click')
    await flushPromises()
    const [message] = confirm.mock.calls[0] as [{ children: { children: string }[] }]
    expect(message.children[0]!.children).toContain('for its members now: Zed Ng')
    expect(writes.map((x) => x.args.group_id)).toEqual(['g-zeta'])
    w.unmount()
  })

  it('to a TA whose group sizes cannot be read, records nothing missing', async () => {
    const ta = { member_id: 'm-ta', role: 'ta', status: 'active', student_scope: 'listed' }
    const w = await mountRoster({ setId: 'set-gone' }, ta)
    expect(reads).toEqual(['group_set.get'])
    expect(rowOf(w, 'Gamma').find('button').exists()).toBe(false)
    w.unmount()
  })

  it('filters the groups by where their work stands', async () => {
    const w = await mountRoster()
    const chips = w.findAll('.filter-chips .el-check-tag')
    expect(chips.map((c) => c.text())).toEqual(['All 4', 'Not started 2', 'Submitted 1', 'Late 1'])
    await chips[1]!.trigger('click')
    await flushPromises()
    const names = w.findAll('.group-roster__table .el-table__row .group-roster__name').map((n) => n.text())
    expect(names).toEqual(['Delta', 'Gamma'])
    w.unmount()
  })

  it('shows one student’s group alone, with nothing left to count', async () => {
    const w = await mountRoster({ studentId: 'm-ken' })
    const names = w.findAll('.group-roster__table .el-table__row .group-roster__name').map((n) => n.text())
    expect(names).toEqual(['Beta'])
    expect(w.find('.filter-chips').exists()).toBe(false)
    expect(w.find('.group-roster__no-group').exists()).toBe(false)
    w.unmount()
  })

  it('by student, says each student’s group, and whose work theirs is where they moved', async () => {
    const w = await mountRoster()
    await w.findAll('.group-roster__mode label')[1]!.trigger('click')
    await flushPromises()
    const studentRow = (name: string) => w.findAll('.roster-table .el-table__row').find((r) => r.text().includes(name))!
    expect(studentRow('Ken Wong').text()).toContain('Beta')
    expect(studentRow('Ken Wong').text()).toContain('Alpha’s work')
    expect(studentRow('Eve').text()).toContain('In no group')
    // Nobody is marked missing one by one on group work.
    expect(w.findAll('.roster-table button').filter((b) => b.text().includes('Mark missing'))).toHaveLength(0)
    w.unmount()
  })

  it('by student, still names the group whose work it is once that group has started again', async () => {
    // Alpha starts attempt 2: its latest is a draft, and Ken's row still names attempt 1.
    const again = groups.map((g) =>
      g.group_id === 'g-alpha'
        ? { ...g, state: 'draft', submission_id: 's-a2', attempt: 2, submitted_at: undefined }
        : g,
    )
    works = { 's-a': { id: 's-a', group_id: 'g-alpha', group_name: 'Alpha', state: 'late', attempt: 1 } }
    const w = await mountRoster({ groups: again })
    await w.findAll('.group-roster__mode label')[1]!.trigger('click')
    await flushPromises()
    const studentRow = (name: string) => w.findAll('.roster-table .el-table__row').find((r) => r.text().includes(name))!
    expect(studentRow('Ken Wong').text()).toContain('Beta')
    expect(studentRow('Ken Wong').text()).toContain('Alpha’s work')
    // Read once, from the work: Yuki's row names Alpha's latest, which is hers.
    expect(reads.filter((r) => r === 'submission.get')).toHaveLength(1)
    expect(studentRow('Yuki Tanaka').text()).not.toContain('’s work')
    w.unmount()
  })
})

describe('recording a group missing once someone has moved since another group handed in', () => {
  // Ken, part of Alpha's work, is in Quince now with Eve; then Rowan has Ken alone.
  const quince = {
    group_id: 'g-quince',
    name: 'Quince',
    members: [
      { member_id: 'm-eve', display_name: 'Eve Lam' },
      { member_id: 'm-ken', display_name: 'Ken Wong' },
    ],
    state: 'not_started',
  }
  const rowan = {
    group_id: 'g-rowan',
    name: 'Rowan',
    members: [{ member_id: 'm-ken', display_name: 'Ken Wong' }],
    state: 'not_started',
  }
  const kenInQuince: RosterEntry[] = [
    {
      student_member_id: 'm-yuki',
      display_name: 'Yuki Tanaka',
      group_id: 'g-alpha',
      state: 'late',
      submission_id: 's-a',
    },
    { student_member_id: 'm-ken', display_name: 'Ken Wong', group_id: 'g-quince', state: 'late', submission_id: 's-a' },
    { student_member_id: 'm-eve', display_name: 'Eve Lam', group_id: 'g-quince', state: 'not_started' },
  ]

  it('names whom Core records it for, and whom it leaves out, and records it', async () => {
    const w = await mountRoster({ groups: [groups[1]!, quince], rows: kenInQuince })
    expect(rowOf(w, 'Quince').text()).toContain(
      'Ken Wong is part of another group’s work for this assignment, so recording the group as missing leaves them out',
    )
    await rowOf(w, 'Quince').find('button').trigger('click')
    await flushPromises()
    const [message] = confirm.mock.calls[0] as [{ children: { children: string }[] }]
    expect(message.children[0]!.children).toContain('for Eve Lam.')
    expect(message.children[0]!.children).not.toContain('Ken Wong')
    expect(message.children[1]!.children).toBe(
      'Ken Wong is left out: they are part of another group’s work for this assignment.',
    )
    expect(writes.map((x) => x.args.group_id)).toEqual(['g-quince'])
    w.unmount()
  })

  it('is not offered on a group whose members are all part of other work, and says why', async () => {
    const rows2 = kenInQuince.map((r) => (r.student_member_id === 'm-ken' ? { ...r, group_id: 'g-rowan' } : r))
    const w = await mountRoster({ groups: [groups[1]!, rowan], rows: rows2 })
    expect(rowOf(w, 'Rowan').find('button').exists()).toBe(false)
    expect(rowOf(w, 'Rowan').text()).toContain(
      'Ken Wong is part of another group’s work for this assignment, so there is nobody here to record as missing',
    )
    w.unmount()
  })

  it('says it in Traditional Chinese', async () => {
    setLocale('zh-Hant')
    const w = await mountRoster({ groups: [groups[1]!, quince], rows: kenInQuince })
    expect(rowOf(w, 'Quince').text()).toContain(
      'Ken Wong已是另一個小組這份作業的成員，因此把小組記錄為缺交時不包括他們',
    )
    await rowOf(w, 'Quince').find('button').trigger('click')
    await flushPromises()
    const [message] = confirm.mock.calls[0] as [{ children: { children: string }[] }]
    expect(message.children[0]!.children).toContain('記錄屬於Eve Lam。')
    w.unmount()
  })
})
