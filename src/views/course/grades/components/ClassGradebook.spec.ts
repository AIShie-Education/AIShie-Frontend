import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as Icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import { fakeContainerWidths } from '@/composables/containerWidthFakes'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import ClassGradebook from './ClassGradebook.vue'

// The whole class's gradebook, mounted with a class of 300 students by 30
// assignments: only the rows near the screen are drawn, the rest follow the
// scroll; a phone's width is a list a student at a time; a seat listed to
// some assignments sees no totals.

const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'
const read = vi.fn()
vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  read: (...a: unknown[]) => read(...a),
  write: vi.fn(),
}))

const N = 300
const A = 30
const id = (p: string, i: number) => `${p}-${String(i).padStart(4, '0')}`
const students = Array.from({ length: N }, (_, i) => ({
  id: id('m', i),
  actor_id: id('actor', i),
  display_name: `Student ${String(i).padStart(3, '0')}`,
  login_id: `s${1000 + i}`,
  kind: 'human',
  role: 'student',
  status: 'active',
  student_scope: 'self',
  assignment_scope: 'all',
  perms: {},
  created_at: '2026-09-01T00:00:00Z',
  answers_course: false,
}))
const assignments = Array.from({ length: A }, (_, i) => ({
  id: id('a', i),
  title: `HW${i + 1}`,
  points_possible: 10,
  component_id: 'bucket',
  published_at: '2026-09-01T00:00:00Z',
  due_at: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(),
}))
const grades = students.flatMap((s, si) => [
  ...assignments.map((a, ai) => ({
    id: id(`g${si}`, ai),
    student_member_id: s.id,
    assignment_id: a.id,
    origin: 'entered',
    score: (si + ai) % 11,
    grader_member_id: 'ta',
    created_by_action_id: 'act',
    state: 'posted',
    created_at: '2026-09-03T00:00:00Z',
  })),
  {
    id: id(`t${si}`, 0),
    student_member_id: s.id,
    component_id: 'root',
    origin: 'computed',
    score: 50 + (si % 50),
    grader_member_id: 'ta',
    created_by_action_id: 'act',
    state: 'posted',
    posted_at: '2026-09-04T00:00:00Z',
    created_at: '2026-09-04T00:00:00Z',
  },
])
/** A page of 200 after the id given, as Core pages a list. */
function paged<T extends { id: string }>(items: T[], args: { after?: string; limit?: number }) {
  const start = args.after ? items.findIndex((x) => x.id === args.after) + 1 : 0
  const limit = args.limit ?? 50
  const slice = items.slice(start, start + limit)
  return { items: slice, next: start + limit < items.length ? slice.at(-1)!.id : null }
}

let seat: Record<string, unknown> = {}
/** The member list as Core gives it; a test may change it. */
let roster = students
/** component.tree's answer; a test may make it fail. */
let scheme: () => unknown = () => ({
  components: [
    { id: 'root', name: 'Course', weight: 1, drop_lowest: 0, sort_order: 0, parent_id: null },
    { id: 'bucket', name: 'Homework', weight: 1, drop_lowest: 0, sort_order: 1, parent_id: 'root' },
  ],
})
/** assignment.list's answer; a test may make it fail. */
let assignmentList: () => unknown = () => ({ assignments, next: null })
beforeEach(() => {
  roster = students
  assignmentList = () => ({ assignments, next: null })
  scheme = () => ({
    components: [
      { id: 'root', name: 'Course', weight: 1, drop_lowest: 0, sort_order: 0, parent_id: null },
      { id: 'bucket', name: 'Homework', weight: 1, drop_lowest: 0, sort_order: 1, parent_id: 'root' },
    ],
  })
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  // A frame at once: what follows the scroll is drawn before the test looks.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  seat = { member_id: 'm-sato', role: 'instructor', assignment_scope: 'all', student_scope: 'all' }
  read.mockReset()
  read.mockImplementation(async (tool: string, args: { after?: string; limit?: number }) => {
    switch (tool) {
      case 'member.list': {
        const p = paged(roster, args)
        return { members: p.items, next: p.next }
      }
      case 'assignment.list':
        return assignmentList()
      case 'component.tree':
        return scheme()
      case 'grade.list': {
        const p = paged(grades, args)
        return { grades: p.items, next: p.next }
      }
      case 'submission.list':
        return { submissions: [], next: null }
    }
    throw new ApiError({ status: 403, code: 'forbidden', message: 'permission denied' })
  })
})
const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.unstubAllGlobals()
  setLocale('en')
  document.body.innerHTML = ''
})

async function mountClass(opts: { query?: Record<string, string>; settle?: string } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().$patch({ me: { id: 'actor-sato', kind: 'human', display_name: 'Sato' } } as never)
  useCourseStore().$patch({
    courseId: COURSE,
    course: { id: COURSE, code: 'CS101', section: 'A', title: 'Programming', status: 'active' } as never,
    membership: seat as never,
    perms: new Proxy({}, { get: () => 'autonomous' }) as never,
    permsSource: 'exact',
  } as never)
  const stub = { render: () => null }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: stub }] })
  for (const name of ['course-grade', 'course-grades', 'course-gradebook'])
    router.addRoute({ path: `/${name}/:courseId/:gradeId?/:studentMemberId?`, name, component: stub })
  await router.push({ path: '/', query: opts.query ?? {} })
  const w = mount(ClassGradebook, {
    props: { courseId: COURSE },
    attachTo: document.body,
    global: {
      plugins: [
        pinia,
        i18n,
        ElementPlus,
        router,
        { install: (app) => Object.entries(Icons).forEach(([n, c]) => app.component(n, c)) },
      ],
    },
  })
  mounted.push(w)
  // Every page of 200, one after another.
  await vi.waitFor(
    async () => {
      await flushPromises()
      expect(w.find(opts.settle ?? '.classbook__count').exists()).toBe(true)
    },
    { timeout: 20_000 },
  )
  await flushPromises()
  return { w, router }
}

const rowNames = (w: VueWrapper) => w.findAll('.matrix__student-name').map((n) => n.text())

describe('the whole class’s gradebook', () => {
  it('draws only the rows near the screen of a class of 300 by 30, and follows the scroll', async () => {
    const { w } = await mountClass()
    expect(w.find('.classbook__count').text()).toBe('300 students')
    const table = w.find('.matrix__table')
    expect(table.attributes('aria-rowcount')).toBe('302')
    // The course total, 30 homeworks and the bucket's total.
    expect(table.attributes('aria-colcount')).toBe(String(1 + 1 + A + 1))
    const drawn = w.findAll('.matrix__row')
    expect(drawn.length).toBeGreaterThan(10)
    expect(drawn.length).toBeLessThan(40)
    expect(rowNames(w)[0]).toBe('Student 000')
    // The rows not drawn are blank space of their height: 44 px each.
    const below = w.findAll('.matrix__pad td').at(-1)!
    expect(below.attributes('style')).toContain(`height: ${(N - drawn.length) * 44}px`)

    const scroller = w.find('.matrix').element as HTMLElement
    scroller.scrollTop = 200 * 44
    await w.find('.matrix').trigger('scroll')
    await flushPromises()
    const names = rowNames(w)
    expect(names).toContain('Student 200')
    expect(names).not.toContain('Student 000')
    expect(w.findAll('.matrix__row').length).toBeLessThan(40)
    expect(w.find('.matrix__row').attributes('aria-rowindex')).toBe(String(Number(names[0]!.slice(-3)) + 2))
  })

  it('sorts by a column’s heading, highest first, then the other way', async () => {
    const { w } = await mountClass()
    await w.find('button[aria-label="Sort by Course total"]').trigger('click')
    await flushPromises()
    // Totals run 50 to 99: student 49 (and 99, 149…) at 99, first by name.
    expect(rowNames(w)[0]).toBe('Student 049')
    expect(w.findAll('thead th')[1]!.attributes('aria-sort')).toBe('descending')
    await w.find('button[aria-label="Sort by Course total"]').trigger('click')
    await flushPromises()
    expect(rowNames(w)[0]).toBe('Student 000')
    expect(w.findAll('thead th')[1]!.attributes('aria-sort')).toBe('ascending')
  })

  it('is a list a student at a time where the toolbar is 542 px or less', async () => {
    const sizes = fakeContainerWidths({ '.classbook__toolbar': 543 })
    const { w } = await mountClass()
    expect(w.find('.matrix__table').exists()).toBe(true)
    await sizes.resize('.classbook__toolbar', 542)
    await flushPromises()
    expect(w.find('.matrix__table').exists()).toBe(false)
    expect(w.findAll('.sgl__item')).toHaveLength(N)
    const first = w.find('.sgl__item')
    expect(first.find('.sgl__total-value').text()).toBe('50%')
    await first.find('.sgl__head').trigger('click')
    expect(first.find('.sgl__head').attributes('aria-expanded')).toBe('true')
    expect(first.findAll('.sgl__grade')).toHaveLength(A + 1)
  })

  it('tells a screen reader the rows the table holds, filtered or not', async () => {
    const { w } = await mountClass()
    await w.find('input[aria-label="Search by name or number"]').setValue('Student 001')
    await flushPromises()
    expect(w.find('.classbook__count').text()).toBe('1 of 300 students')
    const table = w.find('.matrix__table')
    expect(table.attributes('aria-rowcount')).toBe('3')
    expect(w.find('.matrix__row').attributes('aria-rowindex')).toBe('2')
    expect(w.find('tfoot tr').attributes('aria-rowindex')).toBe('3')
  })

  it('keeps the search, the filter and the order in the address, and finds them there again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const { w, router } = await mountClass()
      await w.find('input[aria-label="Search by name or number"]').setValue('Student 01')
      await flushPromises()
      // What is typed, once typing pauses.
      expect(router.currentRoute.value.query).toEqual({})
      vi.advanceTimersByTime(500)
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({ q: 'Student 01' })
      await w.find('button[aria-label="Sort by Course total"]').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({ q: 'Student 01', sort: '-t:root' })
    } finally {
      vi.useRealTimers()
    }
    const { w } = await mountClass({ query: { q: 'Student 01', sort: '-t:root' } })
    expect((w.find('input[aria-label="Search by name or number"]').element as HTMLInputElement).value).toBe(
      'Student 01',
    )
    expect(w.find('.classbook__count').text()).toBe('10 of 300 students')
    expect(w.findAll('thead th')[1]!.attributes('aria-sort')).toBe('descending')
    // Totals run 50 to 99 by student: 019 has the highest of 010 to 019.
    expect(rowNames(w)[0]).toBe('Student 019')
    const drafts = await mountClass({ query: { show: 'drafts' } })
    // No student has a draft.
    expect(drafts.w.text()).toContain('No student matches.')
  })

  it('says it could not read the scheme, rather than show every assignment as not counted', async () => {
    scheme = () => {
      throw new ApiError({ status: 503, code: 'unavailable', message: 'Core is busy' })
    }
    const { w } = await mountClass({ settle: '.el-result' })
    expect(w.find('.matrix__table').exists()).toBe(false)
    expect(w.text()).not.toContain('Not counted')
    expect(w.find('.el-result').text()).toContain('Retry')
    const exportButton = w.findAll('button').find((b) => b.text() === 'Export CSV')!
    expect(exportButton.attributes('disabled')).toBeDefined()
  })

  it('says it could not read the assignments, rather than show the class without them, and reads them again', async () => {
    assignmentList = () => {
      throw new ApiError({ status: 503, code: 'unavailable', message: 'Core is busy' })
    }
    const { w } = await mountClass({ settle: '.el-result' })
    expect(w.find('.matrix__table').exists()).toBe(false)
    expect(w.find('.classbook__count').exists()).toBe(false)
    const exportButton = () => w.findAll('button').find((b) => b.text() === 'Export CSV')!
    expect(exportButton().attributes('disabled')).toBeDefined()
    assignmentList = () => ({ assignments, next: null })
    await w.find('.el-result button').trigger('click')
    await vi.waitFor(
      async () => {
        await flushPromises()
        expect(w.find('.classbook__count').exists()).toBe(true)
      },
      { timeout: 20_000 },
    )
    expect(w.findAll('thead .matrix__head-title').map((h) => h.text())).toContain('HW1')
    expect(exportButton().attributes('disabled')).toBeUndefined()
  })

  it('says so where the seat may not read the assignments, rather than drop their grades unsaid', async () => {
    assignmentList = () => {
      throw new ApiError({ status: 403, code: 'forbidden', message: 'permission denied' })
    }
    const { w } = await mountClass()
    expect(w.find('.el-alert').text()).toContain('Your seat cannot read this course’s assignments')
    expect(w.findAll('thead .matrix__head-title').map((h) => h.text())).not.toContain('HW1')
  })

  it('marks removed students, when shown, and leaves them out of the averages', async () => {
    roster = students.map((m, i) => (i === 0 ? { ...m, status: 'removed' } : i === 1 ? { ...m, status: 'paused' } : m))
    const { w } = await mountClass()
    expect(rowNames(w)[0]).toBe('Student 001')
    expect(w.find('.matrix__row .matrix__status').text()).toBe('Paused')
    const mean = () => w.findAll('tfoot td')[0]!.text()
    const before = mean()
    await w.find('.classbook__toolbar .el-checkbox input').setValue(true)
    await flushPromises()
    expect(rowNames(w)[0]).toBe('Student 000')
    expect(w.find('.matrix__row .matrix__status').text()).toBe('Removed')
    expect(w.find('.classbook__count').text()).toBe('300 students')
    expect(mean()).toBe(before)
    expect(w.text()).toContain('Removed students are marked as such')
  })

  it('does not keep, on the phone’s list, an order the phone cannot say', async () => {
    const sizes = fakeContainerWidths({ '.classbook__toolbar': 900 })
    const { w } = await mountClass()
    await w.find('button[aria-label="Sort by HW1"]').trigger('click')
    await flushPromises()
    expect(rowNames(w)[0]).not.toBe('Student 000')
    await sizes.resize('.classbook__toolbar', 400)
    await flushPromises()
    expect(w.find('.sgl__item .sgl__name').text()).toBe('Student 000')
  })

  it('gives a seat listed to some assignments no totals: none is in its scope', async () => {
    seat = { ...seat, assignment_scope: 'listed' }
    const { w } = await mountClass()
    const heads = w.findAll('thead .matrix__head-title').map((h) => h.text())
    expect(heads).not.toContain('Course total')
    expect(heads).not.toContain('Homework total')
    expect(heads).toHaveLength(1 + A)
    expect(w.text()).not.toContain('Totals are those written down')
  })
})
