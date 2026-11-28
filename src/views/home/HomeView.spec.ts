import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as Icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { useSessionStore } from '@/stores/session'
import { ApiError } from '@/api/http'

// The home page: a card for each course the caller has a seat in, with its
// term, the next assignment due and what waits for them there; a filter only
// once there are enough courses to need one.

const read = vi.hoisted(() => vi.fn())
vi.mock('@/api/http', async (orig) => ({ ...(await orig<typeof import('@/api/http')>()), read }))

const { default: HomeView } = await import('./HomeView.vue')

const day = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()

function seat(i: number, extra: Record<string, unknown> = {}) {
  return {
    course_id: `c${i}`,
    member_id: `m${i}`,
    code: `CS10${i}`,
    section: 'A',
    title: `Course ${i}`,
    role: 'student',
    status: 'active',
    course_status: 'active',
    assignment_scope: 'all',
    student_scope: 'own',
    perms: { document_read: 'autonomous', action_decide: 'denied' },
    perm_ceilings: {},
    ...extra,
  }
}

/** Core as a student reads it: each course in term t1, one assignment due in two days, and her agent's proposals in c1. */
function answer() {
  read.mockImplementation(async (tool: string, args: { course_id?: string }) => {
    switch (tool) {
      case 'course.get':
        return {
          id: args.course_id,
          term_id: 't1',
          instructors: [{ display_name: 'Ada Lovelace' }, { display_name: 'Grace Hopper' }],
        }
      case 'term.list':
        return { terms: [{ id: 't1', name: '2026/27 Term 1' }] }
      case 'assignment.list':
        return {
          assignments: [
            { id: 'a1', title: 'Lab 3', due_at: iso(Date.now() + 2 * day), published_at: iso(Date.now() - day) },
          ],
        }
      case 'action.list_proposed':
        if (args.course_id === 'c1') return { actions: [{ id: 'p1' }, { id: 'p2' }], next: null }
        return { actions: [] }
    }
    throw new Error(`unexpected ${tool}`)
  })
}

async function home(n: number, extra: (i: number) => Record<string, unknown> = () => ({})) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.$patch({ me: { id: 'actor-mei', kind: 'human', display_name: 'Mei' } } as never)
  const seats = Array.from({ length: n }, (_, i) => seat(i + 1, extra(i + 1)))
  session.memberships = seats as never
  vi.spyOn(session, 'loadMemberships').mockResolvedValue(undefined as never)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { render: () => null } },
      { path: '/courses/:courseId', name: 'course-overview', component: { render: () => null } },
      { path: '/admin/courses', name: 'admin-courses', component: { render: () => null } },
    ],
  })
  const w = mount(HomeView, {
    global: {
      plugins: [
        pinia,
        i18n,
        ElementPlus,
        router,
        { install: (app) => Object.entries(Icons).forEach(([k, c]) => app.component(k, c)) },
      ],
    },
  })
  await flushPromises()
  return w
}

enableAutoUnmount(afterEach)
beforeEach(() => {
  // The fixtures are due in two days; keep them inside the same week rather
  // than making this test fail on Fridays, weekends or DST boundaries.
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-23T12:00:00Z'))
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  answer()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  read.mockReset()
  setLocale('en')
})

describe('HomeView', () => {
  it('offers no filter for a few courses, and one from eight on', async () => {
    const few = await home(7)
    expect(few.findAll('.course-card')).toHaveLength(7)
    expect(few.find('.page-header input').exists()).toBe(false)
    few.unmount()

    const many = await home(8)
    expect(many.findAll('.course-card')).toHaveLength(8)
    expect(many.find('.page-header input').exists()).toBe(true)
  })

  it('says on each card its term, the next assignment due and what waits there', async () => {
    const w = await home(2)
    const [first, second] = w.findAll('.course-card')
    expect(first!.find('.course-card__meta').text()).toContain('2026/27 Term 1')
    expect(first!.find('.course-card__due').text()).toMatch(/^Next due: Lab 3, in 2 days$/)
    expect(first!.find('.course-card__waiting').text()).toMatch(/Your agents’ proposals awaiting a decision\s*2/)
    // Nothing waits in the second: no row says so.
    expect(second!.find('.course-card__due').exists()).toBe(true)
    expect(second!.find('.course-card__waiting').exists()).toBe(false)
    // The queue is read as the overview reads it.
    expect(read).toHaveBeenCalledWith('action.list_proposed', { course_id: 'c1', limit: 200 })
  })

  it('adds a useful week summary and names multiple instructors without member_read', async () => {
    const w = await home(2)
    const week = w.find('.home-week')
    expect(week.text()).toContain('This week')
    expect(week.text()).toContain('2 assignments due this week')
    expect(week.text()).toContain('2 proposals awaiting decisions')
    expect(week.text()).toContain('Next: Lab 3 · CS101 · A, in 2 days')
    expect(week.find('.home-week__partial').exists()).toBe(false)
    expect(w.find('.course-card__instructors').text()).toBe('Ada Lovelace and Grace Hopper')
    expect(read.mock.calls.map(([tool]) => tool)).not.toContain('member.list')
  })

  it('distinguishes no instructor from a failed course read and marks the week partial', async () => {
    const base = read.getMockImplementation()!
    read.mockImplementation(async (tool: string, args: { course_id?: string }) => {
      if (tool !== 'course.get') return base(tool, args)
      if (args.course_id === 'c2') throw new ApiError({ status: 500, code: 'internal', message: 'failed' })
      return { id: 'c1', term_id: 't1', instructors: [] }
    })
    const w = await home(2)
    const cards = w.findAll('.course-card')
    expect(cards[0]!.text()).toContain('No instructor listed')
    expect(cards[1]!.text()).toContain('Instructor details unavailable')
    expect(w.find('.home-week__partial').text()).toBe('Some course details are unavailable.')
    // One known empty course still does not make the other course's unknown work a zero.
    expect(w.find('.home-week').text()).toContain('Some course details are unavailable')
  })

  it('says the reader’s role on each card only where their roles differ among their courses', async () => {
    const role = (w: Awaited<ReturnType<typeof home>>) =>
      w.findAll('.course-card').map((c) =>
        c
          .find('.course-card__meta')
          .findAll('.app-tag')
          .map((t) => t.text()),
      )
    // A student in all three: no card says so.
    const same = await home(3)
    expect(role(same)).toEqual([[], [], []])
    same.unmount()
    // A student in two, teaching the third: every card says which.
    const differ = await home(3, (i) => (i === 3 ? { role: 'instructor' } : {}))
    expect(role(differ)).toEqual([['Student'], ['Student'], ['Instructor']])
    differ.unmount()
    // A seat removed is not among the courses, nor among the roles that differ.
    const removed = await home(2, (i) => (i === 2 ? { role: 'instructor', status: 'removed' } : {}))
    expect(role(removed)).toEqual([[]])
  })

  it('says it in the reader’s language', async () => {
    setLocale('zh-Hant')
    const w = await home(1)
    const card = w.find('.course-card')
    expect(card.text()).toContain('2026/27 Term 1')
    expect(card.find('.course-card__waiting').text()).toContain('2')
  })
})
