import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as Icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { Comment, defineComponent, h, KeepAlive } from 'vue'
import { createMemoryHistory, createRouter, useRoute } from 'vue-router'
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
/** The member list as Core gives it; a test may change it, or make it fail. */
let roster = students
let memberList: (args: { after?: string; limit?: number }) => unknown = (args) => {
  const p = paged(roster, args)
  return { members: p.items, next: p.next }
}
/** Grades a test adds to the class's. */
let moreGrades: typeof grades = []
/** submission.roster's answer, by assignment; a test may give one. */
let assignmentRoster: (assignment: string) => unknown = () => {
  throw new ApiError({ status: 403, code: 'forbidden', message: 'permission denied' })
}
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
  memberList = (args) => {
    const p = paged(roster, args)
    return { members: p.items, next: p.next }
  }
  moreGrades = []
  assignmentRoster = () => {
    throw new ApiError({ status: 403, code: 'forbidden', message: 'permission denied' })
  }
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
  read.mockImplementation(async (tool: string, args: { after?: string; limit?: number; assignment_id?: string }) => {
    switch (tool) {
      case 'member.list':
        return memberList(args)
      case 'assignment.list':
        return assignmentList()
      case 'component.tree':
        return scheme()
      case 'grade.list': {
        const p = paged([...grades, ...moreGrades], args)
        return { grades: p.items, next: p.next }
      }
      case 'submission.roster':
        return assignmentRoster(args.assignment_id!)
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

async function mountClass(opts: { query?: Record<string, string>; settle?: string; keptAlive?: boolean } = {}) {
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
  // As GradebookView has it: kept alive, out of the page, while a student's gradebook is open.
  const Kept = defineComponent({
    setup() {
      const route = useRoute()
      return () =>
        h('div', [h(KeepAlive, null, [route.path === '/' ? h(ClassGradebook, { courseId: COURSE }) : h(Comment)])])
    },
  })
  const w = mount(opts.keptAlive ? Kept : ClassGradebook, {
    props: opts.keptAlive ? {} : { courseId: COURSE },
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

  it('says it could not read the member list, rather than name the class by member ID, and reads it again', async () => {
    memberList = () => {
      throw new ApiError({ status: 503, code: 'unavailable', message: 'Core is busy' })
    }
    const { w } = await mountClass({ settle: '.el-result' })
    expect(w.find('.matrix__table').exists()).toBe(false)
    expect(w.text()).not.toContain('Student m0000')
    expect(w.find('.el-result').text()).toContain('Retry')
    const exportButton = () => w.findAll('button').find((b) => b.text() === 'Export CSV')!
    expect(exportButton().attributes('disabled')).toBeDefined()
    memberList = (args) => {
      const p = paged(roster, args)
      return { members: p.items, next: p.next }
    }
    await w.find('.el-result button').trigger('click')
    await vi.waitFor(
      async () => {
        await flushPromises()
        expect(w.find('.classbook__count').text()).toBe('300 students')
      },
      { timeout: 20_000 },
    )
    expect(rowNames(w)[0]).toBe('Student 000')
    expect(exportButton().attributes('disabled')).toBeUndefined()
  })

  it('where the seat may not read the member list, has a row for every student an assignment’s roster lists', async () => {
    seat = { ...seat, role: 'assistant', student_scope: 'listed' }
    memberList = () => {
      throw new ApiError({ status: 403, code: 'forbidden', message: 'permission denied' })
    }
    // Listed to three students: two with grades, and one with nothing yet.
    const listed = [students[0]!.id, students[1]!.id, 'm-new']
    assignmentRoster = (assignment) => {
      expect(assignment).toBe(assignments[0]!.id)
      return {
        students: listed.map((id) => ({ student_member_id: id, state: id === 'm-new' ? 'not_started' : 'submitted' })),
        next: null,
      }
    }
    const scoped = new Set(listed)
    read.mockImplementation(async (tool: string, args: { after?: string; limit?: number; assignment_id?: string }) => {
      switch (tool) {
        case 'member.list':
          return memberList(args)
        case 'assignment.list':
          return { assignments, next: null }
        case 'component.tree':
          return scheme()
        case 'grade.list': {
          const p = paged(
            grades.filter((g) => scoped.has(g.student_member_id)),
            args,
          )
          return { grades: p.items, next: p.next }
        }
        case 'submission.list':
          return { submissions: [], next: null }
        case 'submission.roster':
          return assignmentRoster(args.assignment_id!)
      }
      throw new ApiError({ status: 403, code: 'forbidden', message: 'permission denied' })
    })
    const { w } = await mountClass()
    expect(w.find('.classbook__count').text()).toBe('3 students')
    const names = rowNames(w)
    expect(names).toHaveLength(3)
    // Named by member ID, as the seat may not read names; the one with nothing yet among them, to open.
    expect(names).toContain('Student mnew')
    const newcomer = w.findAll('a.matrix__student').find((a) => a.text().includes('mnew'))!
    expect(newcomer.attributes('href')).toContain('/m-new')
  })

  it('keeps its rows, counted as before, while Refresh reads the class again', async () => {
    const { w } = await mountClass()
    const scroller = w.find('.matrix').element as HTMLElement
    scroller.scrollTop = 100 * 44
    await w.find('.matrix').trigger('scroll')
    await flushPromises()
    const table = w.find('.matrix__table').element
    // The member list read again is held until the test lets it go.
    let answer: () => void = () => undefined
    memberList = (args) =>
      new Promise((done) => {
        answer = () => {
          const p = paged(roster, args)
          done({ members: p.items, next: p.next })
        }
      })
    await w
      .findAll('button')
      .find((b) => b.text() === 'Refresh')!
      .trigger('click')
    await flushPromises()
    expect(w.find('.matrix__table').element).toBe(table)
    expect(w.find('.classbook__count').text()).toBe('300 students')
    expect(rowNames(w)).toContain('Student 100')
    memberList = (args) => {
      const p = paged(roster, args)
      return { members: p.items, next: p.next }
    }
    answer()
    await vi.waitFor(
      async () => {
        await flushPromises()
        expect(w.find('.classbook__reading').exists()).toBe(false)
      },
      { timeout: 20_000 },
    )
    expect(w.find('.matrix__table').element).toBe(table)
    expect(scroller.scrollTop).toBe(100 * 44)
    expect(w.find('.classbook__count').text()).toBe('300 students')
  })

  it('says the posted grade under a draft in the cell, and gives a long score to two places, every place said too', async () => {
    moreGrades = [
      {
        ...grades[0]!,
        id: 'g-draft',
        score: 72.3333,
        state: 'draft',
        created_at: '2026-09-05T00:00:00Z',
      },
    ]
    const { w } = await mountClass()
    // Student 000's HW1: a posted 0, with a draft of 72.3333 over it.
    const cell = w.findAll('.matrix__row')[0]!.findAll('td')[1]!
    expect(cell.classes()).toContain('has-posted')
    expect(cell.find('.matrix__score').text()).toBe('72.33')
    expect(cell.find('.matrix__score').attributes('aria-hidden')).toBe('true')
    expect(cell.find('.matrix__value .matrix__sr').text()).toBe('72.3333')
    expect(cell.find('.matrix__flag.is-draft').text()).toBe('Draft')
    expect(cell.find('.matrix__posted').text()).toBe('Posted 0')
    expect(cell.find('a').attributes('title')).toBe('72.3333 A draft, not posted yet; 0 is posted.')
    expect(cell.find('.matrix__none').exists()).toBe(false)
    // A posted score with no draft over it says nothing more.
    expect(w.findAll('.matrix__row')[1]!.findAll('td')[1]!.text()).toBe('1')

    setLocale('zh-Hant')
    await flushPromises()
    expect(cell.find('.matrix__posted').text()).toBe('已發佈0')
  })

  it('keeps a search typed just before a student is opened, for Back to find in the address', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const { w, router } = await mountClass({ query: { sort: '-t:root' } })
      await w.find('input[aria-label="Search by name or number"]').setValue('Student 01')
      // At once, before typing is taken as paused.
      expect(router.currentRoute.value.query).toEqual({ sort: '-t:root' })
      await router.push({ name: 'course-gradebook', params: { courseId: COURSE, studentMemberId: students[10]!.id } })
      router.back()
      await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/'))
      expect(router.currentRoute.value.query).toEqual({ q: 'Student 01', sort: '-t:root' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves the address Back or Forward goes to as it is, a search typed just before or not', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const { w, router } = await mountClass({ query: { sort: '-t:root' }, keptAlive: true })
      /** Where the history is: the address the browser shows. */
      const address = () => router.options.history.location
      const student = (i: number) =>
        router.resolve({ name: 'course-gradebook', params: { courseId: COURSE, studentMemberId: students[i]!.id } })
          .fullPath
      /** Arrived at a page, and it laid out. */
      const at = async (fullPath: string) => {
        for (let i = 0; i < 20 && router.currentRoute.value.fullPath !== fullPath; i++) await flushPromises()
        expect(router.currentRoute.value.fullPath).toBe(fullPath)
        await flushPromises()
      }
      const type = (text: string) => w.find('input[aria-label="Search by name or number"]').setValue(text)

      // A student, Back to the class, typed, and Forward at once.
      await router.push(student(10))
      router.back()
      await at('/?sort=-t:root')
      await type('Student 01')
      router.forward()
      await at(student(10))
      // The student's page, under its own address.
      expect(address()).toBe(student(10))
      // Nor written there once typing is taken as paused: the class is out of the page.
      vi.advanceTimersByTime(500)
      await flushPromises()
      expect(address()).toBe(student(10))
      // Neither entry lost: the class's as it was left, the student's after it.
      router.back()
      await at('/?sort=-t:root')
      router.forward()
      await at(student(10))

      // The class again (Whole class), typed, and Back at once: the student's page, under its own address.
      await router.push('/')
      await at('/?sort=-t:root')
      await type('Student 02')
      router.back()
      await at(student(10))
      expect(address()).toBe(student(10))
      vi.advanceTimersByTime(500)
      await flushPromises()
      expect(address()).toBe(student(10))
      router.back()
      await at('/?sort=-t:root')
    } finally {
      vi.useRealTimers()
    }
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
