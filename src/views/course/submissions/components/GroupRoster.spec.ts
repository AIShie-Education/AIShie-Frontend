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

// Every write asked for, and what Core answers it with.
let writes: { tool: string; args: Record<string, unknown> }[] = []
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
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
  confirm.mockClear()
})
afterEach(() => {
  document.body.innerHTML = ''
})

async function mountRoster(props: Partial<InstanceType<typeof GroupRoster>['$props']> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const course = useCourseStore()
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
})
