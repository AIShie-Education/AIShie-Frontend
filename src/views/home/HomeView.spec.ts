import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as Icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { useSessionStore } from '@/stores/session'

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
        return { id: args.course_id, term_id: 't1' }
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

async function home(n: number) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.$patch({ me: { id: 'actor-mei', kind: 'human', display_name: 'Mei' } } as never)
  const seats = Array.from({ length: n }, (_, i) => seat(i + 1))
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
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  answer()
})
afterEach(() => {
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

  it('says it in the reader’s language', async () => {
    setLocale('zh-Hant')
    const w = await home(1)
    const card = w.find('.course-card')
    expect(card.text()).toContain('2026/27 Term 1')
    expect(card.find('.course-card__waiting').text()).toContain('2')
  })
})
