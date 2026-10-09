import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

// What Core answers, per test: the caller's agents and the courses an administrator administers.
const answers = vi.hoisted(() => ({
  agents: { agents: [] as unknown[], limit: 5, self_service: true },
  courses: { courses: [] as unknown[] },
}))
const asked = vi.hoisted(() => [] as string[])

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string) => {
      asked.push(tool)
      if (tool === 'conversation.respondents') return { respondents: [] }
      if (tool === 'agent.list') return answers.agents
      if (tool === 'course.list') return answers.courses
      throw new Error(`no answer for ${tool}`)
    }),
  }
})

// Whether this server has the agent runtime, as useRuntime would find it: none, unless a test says so.
const runtimeHere = vi.hoisted(() => ({ available: false, asked: 0 }))
vi.mock('@/composables/useRuntime', async () => {
  const { computed } = await import('vue')
  return {
    useRuntime: () => {
      runtimeHere.asked++
      return {
        available: computed(() => runtimeHere.available),
        info: computed(() => null),
        error: computed(() => null),
        checked: computed(() => true),
        refresh: async () => runtimeHere.available,
      }
    },
  }
})

const { i18n, setLocale } = await import('@/i18n')
const { useSessionStore } = await import('@/stores/session')
const { useSideBarStore } = await import('@/stores/sidebar')
const { useCourseStore } = await import('@/stores/course')
const { default: AppLayout } = await import('@/layouts/AppLayout.vue')

const View = { render: () => null }

interface Seat {
  course_id: string
  code: string
  section?: string
  title: string
  role?: string
  status?: string
  course_status?: string
}
function seat(s: Seat) {
  return {
    member_id: `me-${s.course_id}`,
    section: '',
    role: 'student',
    status: 'active',
    course_status: 'active',
    perms: { conversation_ask: 'denied' },
    ...s,
  } as never
}

const SEATS = [
  seat({ course_id: 'k2', code: 'MA201', title: 'Linear algebra', role: 'instructor' }),
  seat({ course_id: 'k1', code: 'CS101', section: 'A', title: 'Programming' }),
  seat({ course_id: 'k3', code: 'CS050', title: 'Old course', course_status: 'archived' }),
  seat({ course_id: 'k4', code: 'PH110', title: 'Physics', status: 'paused', course_status: 'draft' }),
]

type Who = 'student' | 'instructor' | 'deptAdmin' | 'platformAdmin' | 'agent'
function me(who: Who) {
  return {
    id: 'ada',
    kind: who === 'agent' ? 'agent' : 'human',
    display_name: 'Ada',
    status: 'active',
    platform_role: who === 'platformAdmin' ? 'admin' : undefined,
    administers: who === 'deptAdmin' ? ['d1'] : [],
  } as never
}

/** Signed in as `who`, on a wide screen or a phone's, at `path`. */
async function mountAs(
  who: Who,
  opts: { phone?: boolean; path?: string; seats?: unknown[]; openCourse?: string } = {},
): Promise<{ w: VueWrapper; router: Router; side: ReturnType<typeof useSideBarStore> }> {
  window.matchMedia = ((query: string) => ({
    matches: !!opts.phone && query.includes('max-width'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.me = me(who)
  session.status = 'signedIn'
  session.memberships = (opts.seats ??
    (who === 'instructor' ? SEATS.map((s: { role: string }) => ({ ...s, role: 'instructor' })) : SEATS)) as never
  if (opts.openCourse) {
    // The course the page is in, as its layout has read it: the caller's seat in it, its permissions unknown.
    const course = useCourseStore()
    const s = session.memberships.find((m) => m.course_id === opts.openCourse)!
    course.courseId = s.course_id
    course.course = { id: s.course_id, code: s.code, section: s.section, title: s.title, status: 'active' } as never
    course.membership = s
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: View },
      { path: '/courses/:courseId', name: 'course-overview', component: View },
      { path: '/courses/:courseId/materials', name: 'course-materials', component: View },
      { path: '/courses/:courseId/documents/:documentId', name: 'course-document', component: View },
      ...[
        'assignments',
        'submissions',
        'grades',
        'gradebook',
        'scheme',
        'approvals',
        'members',
        'groups',
        'agents',
        'activity',
        'my-actions',
      ].map((p) => ({ path: `/courses/:courseId/${p}`, name: `course-${p}`, component: View })),
      { path: '/account', name: 'account', component: View },
      { path: '/account/agents', name: 'account-agents', component: View },
      { path: '/account/agents/:actorId', name: 'account-agent', component: View },
      { path: '/admin/courses', name: 'admin-courses', component: View },
      { path: '/admin/courses/:courseId', name: 'admin-course', component: View },
      { path: '/admin/actors', name: 'admin-actors', component: View },
      { path: '/admin/actors/:actorId', name: 'admin-actor', component: View },
      { path: '/admin/terms', name: 'admin-terms', component: View },
      { path: '/admin/departments', name: 'admin-departments', component: View },
      { path: '/admin/presets', name: 'admin-presets', component: View },
      { path: '/admin/sign-in', name: 'admin-sso', component: View },
      { path: '/admin/runtime', name: 'admin-runtime', component: View },
      { path: '/admin/conversation-exports', name: 'admin-export', component: View },
    ],
  })
  await router.push(opts.path ?? '/')
  const w = mount(AppLayout, {
    attachTo: document.body,
    global: { plugins: [pinia, router, i18n, ElementPlus], components: icons },
  })
  await flushPromises()
  return { w, router, side: useSideBarStore() }
}

const activityBar = (w: VueWrapper) => w.get('.activity-bar [role="toolbar"]')
const buttonNames = (w: VueWrapper) =>
  activityBar(w)
    .findAll('button')
    .map((b) => b.attributes('aria-label'))
const button = (w: VueWrapper, name: string) => activityBar(w).get(`button[aria-label="${name}"]`)
const sideTitle = (w: VueWrapper) => w.find('#side-bar #side-bar-title')
/** An element's words, each piece of text apart (its tags are spans of their own). */
const words = (el: Element) => {
  const out: string[] = []
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.textContent?.trim()) out.push(n.textContent.trim())
  return out.join(' ')
}
const links = (root: { findAll: VueWrapper['findAll'] }, selector = '.side-item') =>
  root.findAll(selector).map((a) => words(a.element))
/** A pointer event as a mouse makes it (jsdom has no PointerEvent). */
async function pointer(el: { element: Element }, type: string, clientX: number) {
  el.element.dispatchEvent(new MouseEvent(type, { clientX, button: 0, bubbles: true, cancelable: true }))
  await flushPromises()
}
const kept = () => JSON.parse(localStorage.getItem('aishie.sideBar') ?? 'null')

beforeEach(() => {
  localStorage.clear()
  setLocale('en')
  asked.length = 0
  answers.agents = { agents: [], limit: 5, self_service: true }
  answers.courses = { courses: [] }
})
enableAutoUnmount(afterEach)
afterEach(() => {
  document.body.innerHTML = ''
})

describe('the activity bar', () => {
  it('runs along the left edge, a vertical toolbar, under the brand’s mark, which leads home', async () => {
    const { w } = await mountAs('student', { path: '/courses/k1' })
    const bar = w.get('.app-shell > .activity-bar')
    expect(w.get('.app-shell').element.firstElementChild).toBe(bar.element)
    const home = bar.get('a.activity-bar__home')
    expect(home.attributes('href')).toBe('/')
    expect(home.attributes('aria-label')).toBe('My courses')
    expect(home.find('svg.app-mark').attributes('aria-hidden')).toBe('true')
    const toolbar = activityBar(w)
    expect(toolbar.attributes('role')).toBe('toolbar')
    expect(toolbar.attributes('aria-orientation')).toBe('vertical')
    expect(toolbar.attributes('aria-label')).toBe('Side bar views')
    // Then the side bar, then the page.
    expect(w.find('.app-shell > .activity-bar + #side-bar + .app-main-wrap').exists()).toBe(true)
  })

  it.each([
    ['student', ['Courses', 'Agents']],
    ['instructor', ['Courses', 'Agents']],
    ['deptAdmin', ['Courses', 'Agents', 'Administration']],
    ['platformAdmin', ['Courses', 'Agents', 'Administration']],
    ['agent', ['Courses']],
  ] as const)('offers a %s %j', async (who, names) => {
    const { w } = await mountAs(who)
    expect(buttonNames(w)).toEqual(names)
    const tips = w.findAllComponents({ name: 'ElTooltip' }).map((c) => c.props('content') as string | undefined)
    for (const n of names) expect(tips).toContain(n)
  })

  it('shows a view when its button is pressed, and collapses the side bar when the shown one’s is', async () => {
    const { w } = await mountAs('platformAdmin')
    expect(sideTitle(w).text()).toBe('Courses')
    expect(button(w, 'Courses').attributes('aria-expanded')).toBe('true')
    expect(button(w, 'Courses').classes()).toContain('is-active')
    expect(button(w, 'Courses').attributes('aria-controls')).toBe('side-bar')

    await button(w, 'Agents').trigger('click')
    await flushPromises()
    expect(sideTitle(w).text()).toBe('Agents')
    expect(button(w, 'Agents').attributes('aria-expanded')).toBe('true')
    expect(button(w, 'Courses').attributes('aria-expanded')).toBe('false')

    await button(w, 'Administration').trigger('click')
    await flushPromises()
    expect(sideTitle(w).text()).toBe('Administration')

    await button(w, 'Administration').trigger('click')
    await flushPromises()
    expect(w.find('#side-bar').exists()).toBe(false)
    expect(buttonNames(w).map((n) => button(w, n!).attributes('aria-expanded'))).toEqual(['false', 'false', 'false'])
    // The page takes the room: nothing between the activity bar and it.
    expect(w.find('.app-shell > .activity-bar + .app-main-wrap').exists()).toBe(true)

    await button(w, 'Courses').trigger('click')
    await flushPromises()
    expect(sideTitle(w).text()).toBe('Courses')
  })

  it('leaves Enter and Space to its buttons, which their tooltips would otherwise take', async () => {
    const { w } = await mountAs('student')
    for (const [key, code] of [
      ['Enter', 'Enter'],
      [' ', 'Space'],
    ]) {
      const e = new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true })
      button(w, 'Agents').element.dispatchEvent(e)
      expect(e.defaultPrevented, key).toBe(false)
    }
  })

  it('is one stop for Tab, and the arrow keys, Home and End move between its buttons', async () => {
    const { w } = await mountAs('platformAdmin', { path: '/admin/terms' })
    const tabbable = () =>
      activityBar(w)
        .findAll('button')
        .filter((b) => b.attributes('tabindex') === '0')
        .map((b) => b.attributes('aria-label'))
    // The shown view's button is the one Tab reaches.
    expect(tabbable()).toEqual(['Administration'])

    const press = (key: string) => {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      document.activeElement!.dispatchEvent(e)
      return e
    }
    ;(button(w, 'Administration').element as HTMLElement).focus()
    press('ArrowDown')
    expect(document.activeElement).toBe(button(w, 'Courses').element)
    await flushPromises()
    expect(tabbable()).toEqual(['Courses'])
    press('ArrowDown')
    expect(document.activeElement).toBe(button(w, 'Agents').element)
    press('ArrowUp')
    expect(document.activeElement).toBe(button(w, 'Courses').element)
    press('ArrowUp')
    expect(document.activeElement).toBe(button(w, 'Administration').element)
    press('Home')
    expect(document.activeElement).toBe(button(w, 'Courses').element)
    press('End')
    expect(document.activeElement).toBe(button(w, 'Administration').element)
    expect(press('ArrowRight').defaultPrevented).toBe(false)
  })
})

describe('the side bar', () => {
  it('follows the page to its view, and never opens itself once collapsed', async () => {
    const { w, router } = await mountAs('deptAdmin', { path: '/admin/departments' })
    expect(sideTitle(w).text()).toBe('Administration')
    await router.push('/courses/k1/materials')
    await flushPromises()
    expect(sideTitle(w).text()).toBe('Courses')
    await router.push('/account/agents')
    await flushPromises()
    expect(sideTitle(w).text()).toBe('Agents')
    // Home and the account belong to no view: it stays.
    await router.push('/')
    await router.push('/account')
    await flushPromises()
    expect(sideTitle(w).text()).toBe('Agents')

    await button(w, 'Agents').trigger('click')
    await flushPromises()
    await router.push('/admin/courses')
    await flushPromises()
    expect(w.find('#side-bar').exists()).toBe(false)
    expect(button(w, 'Administration').attributes('aria-expanded')).toBe('false')
    // Opened again, it is on the page's view.
    await button(w, 'Administration').trigger('click')
    await flushPromises()
    expect(sideTitle(w).text()).toBe('Administration')
  })

  it('is remembered by this browser: its view and whether it is open', async () => {
    const first = await mountAs('student')
    await button(first.w, 'Agents').trigger('click')
    await flushPromises()
    expect(kept()).toEqual({ open: true, view: 'agents' })
    first.w.unmount()

    const again = await mountAs('student')
    expect(sideTitle(again.w).text()).toBe('Agents')
    await button(again.w, 'Agents').trigger('click')
    await flushPromises()
    expect(kept()).toEqual({ open: false, view: 'agents' })
    again.w.unmount()

    const collapsed = await mountAs('student')
    expect(collapsed.w.find('#side-bar').exists()).toBe(false)
  })

  it('is 260 px wide, with no edge to resize it by', async () => {
    // A width an earlier version kept is not taken.
    localStorage.setItem('aishie.sideBar', JSON.stringify({ open: true, view: 'courses', width: 380 }))
    const { w } = await mountAs('student')
    const bar = w.get('#side-bar')
    expect(bar.attributes('style')).toContain('width: 260px')
    expect(bar.find('[role="separator"]').exists()).toBe(false)
    expect(w.find('.side-bar__handle').exists()).toBe(false)
    // Nothing on it takes the keys that moved an edge, nor a drag from its edge.
    for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      bar.element.dispatchEvent(e)
      expect(e.defaultPrevented, key).toBe(false)
    }
    await pointer(bar, 'pointerdown', 307)
    await pointer(bar, 'pointermove', 400)
    await pointer(bar, 'pointerup', 400)
    expect(bar.attributes('style')).toContain('width: 260px')
    expect(document.body.classList).not.toContain('is-resizing-side')
  })
})

describe('the courses view', () => {
  it('lists the caller’s courses: code and section, title, role, and whether paused, a draft or archived', async () => {
    const { w } = await mountAs('student', { path: '/courses/k2' })
    const body = w.get('#side-bar')
    // By code and section; archived ones wait behind the switch.
    expect(links(body, '.side-course')).toEqual([
      'CS101 · A Student Programming',
      'MA201 Instructor Linear algebra',
      'PH110 Student Physics Paused Draft',
    ])
    // The page's course stands out.
    const active = body.findAll('.side-course.is-active')
    expect(active.map((a) => a.attributes('href'))).toEqual(['/courses/k2'])
    expect(active[0]!.attributes('aria-current')).toBe('page')
    // And the whole list, My courses, is a link away.
    expect(body.get('a.side-link[href="/"]').text()).toBe('My courses')
  })

  it('shows archived courses behind a switch that says how many there are', async () => {
    const { w } = await mountAs('student')
    const body = w.get('#side-bar')
    const toggle = body.get('.side-courses__archived')
    expect(toggle.text()).toBe('Show archived (1)')
    await toggle.get('input').setValue(true)
    expect(links(body, '.side-course')).toContain('CS050 Student Old course Archived')
  })

  it('filters by code, section or title', async () => {
    const { w } = await mountAs('student')
    const body = w.get('#side-bar')
    const filter = body.get('input[aria-label="Filter courses"]')
    await filter.setValue('algebra')
    expect(links(body, '.side-course')).toEqual(['MA201 Instructor Linear algebra'])
    await filter.setValue('cs101 a')
    expect(links(body, '.side-course')).toEqual(['CS101 · A Student Programming'])
    await filter.setValue('nothing like it')
    expect(links(body, '.side-course')).toEqual([])
    expect(body.get('.side-note').text()).toBe('No course matches.')
  })

  it('says so where the caller has no seat', async () => {
    const { w } = await mountAs('student', { seats: [] })
    expect(w.get('#side-bar .side-note').text()).toBe('You are not seated in any course yet.')
    expect(w.find('.side-courses__archived').exists()).toBe(false)
  })

  it('offers an administrator the courses they administer without a seat, on their administration pages', async () => {
    answers.courses = {
      courses: [
        {
          id: 'k1',
          code: 'CS101',
          section: 'A',
          title: 'Programming',
          status: 'active',
          created_at: '2026-09-01T00:00:00Z',
        },
        { id: 'u1', code: 'BIO1', section: '', title: 'Biology', status: 'active', created_at: '2026-09-02T00:00:00Z' },
        {
          id: 'u2',
          code: 'CHE1',
          section: 'B',
          title: 'Chemistry',
          status: 'draft',
          created_at: '2026-09-03T00:00:00Z',
        },
        {
          id: 'u3',
          code: 'HIS1',
          section: '',
          title: 'History',
          status: 'archived',
          created_at: '2026-09-04T00:00:00Z',
        },
      ],
    }
    const { w } = await mountAs('deptAdmin', { path: '/admin/courses/u1' })
    await button(w, 'Courses').trigger('click')
    await flushPromises()
    expect(asked).toContain('course.list')
    const body = w.get('#side-bar')
    expect(body.get('#side-unseated-title').text()).toBe('Administered, without a seat')
    // Newest first, those with a seat left out, archived ones behind the switch.
    const unseated = body.findAll('.side-course.is-unseated')
    expect(unseated.map((a) => [a.attributes('href'), words(a.element)])).toEqual([
      ['/admin/courses/u2', 'CHE1 · B Draft Chemistry'],
      ['/admin/courses/u1', 'BIO1 Biology'],
    ])
    expect(unseated[1]!.classes()).toContain('is-active')
    expect(body.get('.side-courses__archived').text()).toBe('Show archived (2)')
  })

  it('asks for no one else’s courses where the caller administers nothing', async () => {
    await mountAs('instructor')
    expect(asked).not.toContain('course.list')
  })
})

describe('the agents view', () => {
  const AGENTS = [
    {
      actor_id: 'ag1',
      display_name: 'Study buddy',
      status: 'active',
      suspended_by_me: false,
      last_seen_at: new Date().toISOString(),
      live_seats: 1,
      pending_requests: 0,
      site_chat: true,
      created_at: '2026-09-01T00:00:00Z',
    },
    {
      actor_id: 'ag2',
      display_name: 'Grader',
      status: 'suspended',
      suspended_by_me: true,
      last_seen_at: null,
      live_seats: 0,
      pending_requests: 0,
      site_chat: false,
      created_at: '2026-09-02T00:00:00Z',
    },
  ]

  it('lists the caller’s agents with whether each is suspended and connected, as My agents reads them', async () => {
    answers.agents = { agents: AGENTS, limit: 5, self_service: true }
    const { w } = await mountAs('student', { path: '/account/agents/ag2' })
    expect(asked).toContain('agent.list')
    const body = w.get('#side-bar')
    expect(sideTitle(w).text()).toBe('Agents')
    const items = body.findAll('.side-agent')
    expect(items.map((a) => a.attributes('href'))).toEqual(['/account/agents/ag1', '/account/agents/ag2'])
    expect(items[0]!.text()).toContain('Study buddy')
    expect(items[0]!.text()).toContain('Connected')
    expect(items[1]!.text()).toContain('Never connected')
    expect(items[1]!.text()).toContain('Suspended by you')
    expect(items[1]!.classes()).toContain('is-active')
    expect(body.get('a.side-link[href="/account/agents"]').text()).toBe('My agents')
  })

  it('registers a new agent in the same dialog as My agents', async () => {
    const { w } = await mountAs('student', { path: '/account/agents' })
    const body = w.get('#side-bar')
    expect(body.get('.side-note').text()).toBe('You have no agents yet.')
    const create = body.get('button.side-agents__new')
    expect(create.text()).toBe('New agent')
    await create.trigger('click')
    await flushPromises()
    const dialog = document.body.querySelector('.el-dialog')
    expect(dialog?.textContent).toContain('New agent')
    // Over the whole page, not inside the side bar.
    expect(w.get('#side-bar').element.contains(dialog)).toBe(false)
  })

  it('holds the button back at the limit, and offers none where only an administrator registers agents', async () => {
    answers.agents = { agents: AGENTS.slice(0, 1), limit: 1, self_service: true }
    const at = await mountAs('student', { path: '/account/agents' })
    expect(at.w.get('button.side-agents__new').attributes('disabled')).toBeDefined()
    at.w.unmount()

    answers.agents = { agents: [], limit: 5, self_service: false }
    const none = await mountAs('student', { path: '/account/agents' })
    expect(none.w.find('button.side-agents__new').exists()).toBe(false)
  })
})

describe('the administration view', () => {
  it('lists every administration page for a platform administrator, the one open standing out', async () => {
    const { w } = await mountAs('platformAdmin', { path: '/admin/actors/p1' })
    const body = w.get('#side-bar')
    expect(links(body)).toEqual([
      'Courses',
      'People & agents',
      'Terms',
      'Departments',
      'Permission presets',
      'Sign-in',
      'Export conversations',
    ])
    expect(body.findAll('.side-item.is-active').map((a) => a.text())).toEqual(['People & agents'])
  })

  it('offers a platform administrator the agent runtime’s settings where this server has one', async () => {
    runtimeHere.available = true
    try {
      const { w } = await mountAs('platformAdmin', { path: '/admin/runtime' })
      const body = w.get('#side-bar')
      expect(links(body)).toEqual([
        'Courses',
        'People & agents',
        'Terms',
        'Departments',
        'Permission presets',
        'Sign-in',
        'AI and documents',
        'Export conversations',
      ])
      expect(body.findAll('.side-item.is-active').map((a) => a.text())).toEqual(['AI and documents'])
      expect(body.find('a[href="/admin/runtime"]').attributes('aria-current')).toBe('page')
    } finally {
      runtimeHere.available = false
    }
  })

  it('never asks whether there is a runtime for a department’s administrator, nor offers its settings', async () => {
    runtimeHere.available = true
    runtimeHere.asked = 0
    try {
      const { w } = await mountAs('deptAdmin', { path: '/admin/departments' })
      expect(links(w.get('#side-bar'))).toEqual(['Courses', 'Departments', 'Export conversations'])
      expect(runtimeHere.asked).toBe(0)
    } finally {
      runtimeHere.available = false
    }
  })

  it('lists courses, departments and exporting conversations alone for a department’s administrator', async () => {
    const { w } = await mountAs('deptAdmin', { path: '/admin/departments' })
    const body = w.get('#side-bar')
    expect(links(body)).toEqual(['Courses', 'Departments', 'Export conversations'])
    expect(body.findAll('a').map((a) => a.attributes('href'))).toEqual([
      '/admin/courses',
      '/admin/departments',
      '/admin/conversation-exports',
    ])
  })
})

describe('on a phone', () => {
  async function openMenu(w: VueWrapper) {
    await w.get('.app-header button[aria-label="Menu"]').trigger('click')
    await flushPromises()
    const drawer = document.body.querySelector<HTMLElement>('.app-nav-drawer')
    expect(drawer).not.toBeNull()
    return drawer!
  }
  const tabs = (drawer: HTMLElement) => [...drawer.querySelectorAll<HTMLElement>('[role="tab"]')]

  it('has no activity bar: the header’s menu shows the views as tabs, the one chosen below them', async () => {
    const { w } = await mountAs('platformAdmin', { phone: true, path: '/courses/k1' })
    expect(w.find('.activity-bar').exists()).toBe(false)
    expect(w.find('#side-bar').exists()).toBe(false)
    const drawer = await openMenu(w)
    const list = drawer.querySelector('[role="tablist"]')!
    expect(list.getAttribute('aria-label')).toBe('Side bar views')
    expect(tabs(drawer).map((t) => t.textContent?.trim())).toEqual(['Courses', 'Agents', 'Administration'])
    expect(tabs(drawer).map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    const panel = drawer.querySelector<HTMLElement>('#side-bar-panel')!
    expect(panel.getAttribute('role')).toBe('tabpanel')
    expect(panel.getAttribute('aria-labelledby')).toBe('side-tab-courses')
    expect(panel.querySelector('.side-course.is-active')?.getAttribute('href')).toBe('/courses/k1')

    tabs(drawer)[2]!.click()
    await flushPromises()
    expect(tabs(drawer).map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true'])
    expect(panel.getAttribute('aria-labelledby')).toBe('side-tab-admin')
    expect([...panel.querySelectorAll('.side-item')].map((a) => a.textContent?.trim())).toContain('Terms')

    // The arrow keys choose among the tabs, which are one stop for Tab.
    tabs(drawer)[2]!.focus()
    tabs(drawer)[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await flushPromises()
    expect(document.activeElement).toBe(tabs(drawer)[0])
    expect(tabs(drawer).map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
  })

  it('offers a student their courses and agents, and an agent its courses alone', async () => {
    const student = await mountAs('student', { phone: true })
    expect(tabs(await openMenu(student.w)).map((t) => t.textContent?.trim())).toEqual(['Courses', 'Agents'])
    student.w.unmount()
    document.body.innerHTML = ''
    const agent = await mountAs('agent', { phone: true })
    expect(tabs(await openMenu(agent.w)).map((t) => t.textContent?.trim())).toEqual(['Courses'])
  })

  it('closes as a link in it is followed, even to the page already shown', async () => {
    const { w, router } = await mountAs('student', { phone: true, path: '/courses/k1' })
    const drawer = await openMenu(w)
    const overlay = drawer.closest<HTMLElement>('.el-overlay')!
    const visible = () => overlay.style.display !== 'none'
    expect(visible()).toBe(true)
    drawer.querySelector<HTMLElement>('.side-course[href="/courses/k1"]')!.click()
    await flushPromises()
    expect(visible()).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/courses/k1')

    const again = await openMenu(w)
    expect(visible()).toBe(true)
    again.querySelector<HTMLElement>('.side-course[href="/courses/k2"]')!.click()
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/courses/k2')
    expect(visible()).toBe(false)
  })
})

describe('on a course’s pages', () => {
  it('heads the page with the way back up: the course, then the tab, rather than the page’s name', async () => {
    const { w } = await mountAs('student', { path: '/courses/k1/documents/d1', openCourse: 'k1' })
    const crumbs = w.get('.app-header nav.course-crumbs')
    expect(crumbs.attributes('aria-label')).toBe('Where you are')
    const steps = crumbs.findAll('li')
    expect(steps.map((li) => words(li.element))).toEqual(['CS101 · A Programming', 'Materials'])
    expect(steps[0]!.get('a').attributes('href')).toBe('/courses/k1')
    // A document is under Materials: the tab is the way back to its page.
    expect(steps[1]!.get('a').attributes('href')).toBe('/courses/k1/materials')
    expect(w.find('.app-header__title').exists()).toBe(false)
  })

  it('names the tab shown as the page it is on', async () => {
    const { w } = await mountAs('student', { path: '/courses/k1/materials', openCourse: 'k1' })
    const last = w.findAll('.course-crumbs li').at(-1)!
    expect(last.find('a').exists()).toBe(false)
    expect(last.get('[aria-current="page"]').text()).toBe('Materials')
  })

  it('marks only the tab as the page on the overview, the course before it a link like any other', async () => {
    const { w } = await mountAs('student', { path: '/courses/k1', openCourse: 'k1' })
    const crumbs = w.get('.app-header nav.course-crumbs')
    expect(crumbs.findAll('[aria-current]').map((el) => [el.text(), el.attributes('aria-current')])).toEqual([
      ['Overview', 'page'],
    ])
    expect(crumbs.get('li a').attributes('href')).toBe('/courses/k1')
  })

  it('follows Grades with the grades’ tab shown', async () => {
    const { w } = await mountAs('student', { path: '/courses/k1/scheme', openCourse: 'k1' })
    const steps = w.findAll('.course-crumbs li')
    expect(steps.map((li) => words(li.element))).toEqual(['CS101 · A Programming', 'Grades', 'Grading scheme'])
    expect(steps[1]!.get('a').attributes('href')).toBe('/courses/k1/grades')
  })

  it('heads a page of no course with its name, as before', async () => {
    const { w } = await mountAs('student', { path: '/account' })
    expect(w.find('.course-crumbs').exists()).toBe(false)
    expect(w.find('.app-header__title').exists()).toBe(true)
  })

  it('lists the course’s tabs under it in the phone’s menu, the page’s marked, and closes as one is followed', async () => {
    const { w, router } = await mountAs('student', { phone: true, path: '/courses/k1/materials', openCourse: 'k1' })
    await w.get('.app-header button[aria-label="Menu"]').trigger('click')
    await flushPromises()
    const drawer = document.body.querySelector<HTMLElement>('.app-nav-drawer')!
    const tabs = drawer.querySelector<HTMLElement>('nav.side-course-tabs')!
    expect(tabs.getAttribute('aria-label')).toBe('Sections of CS101 · A')
    // Right under the course the page is in, and under no other.
    expect(tabs.previousElementSibling?.getAttribute('href')).toBe('/courses/k1')
    expect(drawer.querySelectorAll('nav.side-course-tabs')).toHaveLength(1)
    const items = [...tabs.querySelectorAll<HTMLAnchorElement>('a')]
    expect(items.map((a) => a.textContent?.trim())).toContain('Assignments')
    expect(tabs.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('Materials')
    // The course over them is the one the page is in, not the page, which is the tab.
    expect(drawer.querySelector('.side-course[href="/courses/k1"]')?.getAttribute('aria-current')).toBe('true')
    expect(drawer.querySelectorAll('[aria-current="page"]')).toHaveLength(1)

    const overlay = drawer.closest<HTMLElement>('.el-overlay')!
    items.find((a) => a.textContent?.trim() === 'Assignments')!.click()
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/courses/k1/assignments')
    expect(overlay.style.display).toBe('none')
  })

  it('lists no course’s tabs in the docked side bar, where the course is the page only on its overview', async () => {
    const { w } = await mountAs('student', { path: '/courses/k1/materials', openCourse: 'k1' })
    const side = w.get('#side-bar')
    expect(side.find('nav.side-course-tabs').exists()).toBe(false)
    expect(side.get('.side-course[href="/courses/k1"]').attributes('aria-current')).toBe('true')
  })
})
