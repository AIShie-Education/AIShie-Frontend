import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createMemoryHistory, createRouter, RouterView, type RouteLocationRaw } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import { forgetDepartmentTree } from '@/composables/useDepartmentTree'
import { useSessionStore } from '@/stores/session'
import { useCourseStore } from '@/stores/course'
import { fakeContainerWidths } from '@/composables/containerWidthFakes'
import PageHeader from '@/components/PageHeader.vue'
import CourseLayout from './CourseLayout.vue'

let answers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {}
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn((tool: string, args: Record<string, unknown>) => {
      const a = answers[tool]
      return a ? a(args) : Promise.reject(new Error(`no answer for ${tool}`))
    }),
  }
})

const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'
const course = {
  id: COURSE,
  dept_id: 'S',
  term_id: 'T',
  code: 'CS201',
  section: '',
  title: 'Data Structures',
  status: 'active',
  created_at: '2026-09-01T00:00:00Z',
}
const notAMember = () =>
  new ApiError({ status: 403, code: 'forbidden', message: 'not permitted', details: { reason: 'not_a_member' }, actionStatus: 'denied' })

beforeEach(() => {
  setLocale('en')
  forgetDepartmentTree()
  answers = {
    'me.memberships': async () => ({ memberships: [] }),
    'course.get': async () => Promise.reject(notAMember()),
  }
})
enableAutoUnmount(afterEach)
afterEach(() => {
  document.body.innerHTML = ''
})

async function mountAs(platformRole: string | null, administers: boolean) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.me = {
    id: 'ada',
    kind: 'human',
    display_name: 'Ada',
    status: 'active',
    platform_role: platformRole,
    administers: administers ? [{ dept_id: 'F', name: 'Engineering', appointment_id: 'ap', appointed_at: '2026-09-01T00:00:00Z' }] : null,
  } as never
  session.status = 'signedIn'
  const blank = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: blank },
      { path: '/admin/courses/:courseId', name: 'admin-course', component: blank },
      { path: '/courses/:courseId', name: 'course-overview', component: blank },
    ],
  })
  await router.push({ name: 'course-overview', params: { courseId: COURSE } })
  const w = mount(CourseLayout, {
    props: { courseId: COURSE },
    attachTo: document.body,
    global: { plugins: [pinia, router, i18n, ElementPlus], components: icons },
  })
  await flushPromises()
  return w
}

describe('CourseLayout, for an administrator without a seat', () => {
  it('tells a department administrator of the course to seat themselves, and where', async () => {
    answers['course.list'] = async () => ({ courses: [course] })
    const w = await mountAs(null, true)
    expect(w.text()).toContain('You have no seat in this course')
    expect(w.text()).toContain('Administering its department does not open a course')
    expect(w.find('a').attributes('href')).toBe(`/admin/courses/${COURSE}`)
  })

  it('refuses a department administrator a course they do not administer as it would anyone', async () => {
    answers['course.list'] = async () => ({ courses: [] })
    const w = await mountAs(null, true)
    expect(w.text()).not.toContain('You have no seat in this course')
    expect(w.findAll('a').map((a) => a.attributes('href'))).not.toContain(`/admin/courses/${COURSE}`)
  })

  it('tells a platform administrator as before, without asking which courses they administer', async () => {
    const w = await mountAs('admin', false)
    expect(w.text()).toContain('You have no seat in this course')
    expect(w.text()).toContain('Administering the platform does not open a course')
  })

  it('leaves anyone else refused', async () => {
    const w = await mountAs(null, false)
    expect(w.text()).not.toContain('You have no seat in this course')
  })
})

// --- A course's pages: the line of context, the tab strip and the page's header ---------------------------------

const TEACHER_TABS = [
  'Overview',
  'Materials',
  'Assignments',
  'Submissions',
  'Grades',
  'Approvals',
  'Members',
  'Groups',
  'Agents',
  'Activity',
  'My actions',
]

/** A page of the course: its header, titled as the route's page would be. */
const page = (title: string, back = false) => ({
  render: () => h(PageHeader, { title, subtitle: `About ${title}`, back: back ? '/' : undefined }),
})

async function mountCourse(to: RouteLocationRaw, role: 'instructor' | 'student' = 'instructor') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.me = { id: 'ada', kind: 'human', display_name: 'Ada', status: 'active', platform_role: null } as never
  session.status = 'signedIn'
  const store = useCourseStore()
  store.courseId = COURSE
  store.course = { ...course, section: 'A' } as never
  store.membership = { course_id: COURSE, member_id: 'M1', role, status: 'active' } as never
  if (role === 'student') {
    store.perms = { document_read: 'autonomous', submission_read: 'autonomous', grade_read: 'autonomous' } as never
    store.permsSource = 'exact'
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { render: () => null } },
      { path: '/admin/courses/:courseId', name: 'admin-course', component: { render: () => null } },
      {
        path: '/courses/:courseId',
        component: CourseLayout,
        props: true,
        children: [
          { path: '', name: 'course-overview', component: page('Overview') },
          { path: 'materials', name: 'course-materials', component: page('Materials') },
          { path: 'documents/:documentId', name: 'course-document', component: page('Week 1', true) },
          { path: 'assignments', name: 'course-assignments', component: page('Assignments') },
          { path: 'submissions', name: 'course-submissions', component: page('Submissions') },
          { path: 'grades', name: 'course-grades', component: page(role === 'student' ? 'My grades' : 'Grades') },
          { path: 'gradebook/:studentMemberId?', name: 'course-gradebook', component: page('Gradebook') },
          { path: 'scheme', name: 'course-scheme', component: page('Grading scheme') },
          { path: 'approvals', name: 'course-approvals', component: page('Approvals') },
          { path: 'members', name: 'course-members', component: page('Members') },
          { path: 'groups', name: 'course-groups', component: page('Groups') },
          { path: 'groups/:setId', name: 'course-group-set', component: page('Project groups', true) },
          { path: 'agents', name: 'course-agents', component: page('Agents') },
          { path: 'activity', name: 'course-activity', component: page('Activity') },
          { path: 'my-actions', name: 'course-my-actions', component: page('My actions') },
        ],
      },
    ],
  })
  await router.push(to)
  const w = mount(
    { render: () => h(RouterView) },
    {
      attachTo: document.body,
      global: { plugins: [pinia, router, i18n, ElementPlus], components: icons },
    },
  )
  await flushPromises()
  return w
}
const stripTabs = (w: VueWrapper) => w.findAll('.course-tabs a.course-tabs__item').map((a) => a.text())

/** A strip of `width` px whose tabs, and More, are 100 px each, as a browser would lay them out. */
function narrowStrip(width: number) {
  fakeContainerWidths({ '.course-tabs': width })
  const real = Element.prototype.getBoundingClientRect
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return this.closest('.course-tabs__measure') ? ({ width: 100 } as DOMRect) : real.call(this)
  })
}

/** A window as narrow as a phone's (or not), where the side bar is the menu's drawer. */
function phoneWindow(phone: boolean) {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: phone && /max-width/.test(media),
    media,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

describe('CourseLayout, on a course’s pages', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('names the course in a line of context, its code, its name and its status, and leaves the h1 to the page', async () => {
    const w = await mountCourse({ name: 'course-materials', params: { courseId: COURSE } })
    const head = w.find('.course-head')
    expect(head.find('.course-head__code').text()).toBe('CS201·A')
    expect(head.find('.course-head__title').text()).toBe('Data Structures')
    // Cut short where it is long, and said in full on hover.
    expect(head.find('.course-head__title').attributes('title')).toBe('Data Structures')
    expect(head.text()).toContain('Active')
    expect(head.find('h1').exists()).toBe(false)
    expect(w.findAll('h1').map((h1) => h1.text())).toEqual(['Materials'])
  })

  it('offers a teacher every one of their eleven tabs where they fit, with no More', async () => {
    const w = await mountCourse({ name: 'course-materials', params: { courseId: COURSE } })
    expect(stripTabs(w)).toEqual(TEACHER_TABS)
    expect(w.find('.course-tabs .course-tabs__more').exists()).toBe(false)
    expect(w.find('.course-tabs a.is-active').text()).toBe('Materials')
    // The gradebook and the grading scheme are no tabs of their own: they are the Grades tab's.
    expect(w.text()).not.toContain('Gradebook')
  })

  it('shows as many tabs as fit beside More, by the strip’s own width, and only the rest under it', async () => {
    narrowStrip(700)
    const w = await mountCourse({ name: 'course-overview', params: { courseId: COURSE } })
    await new Promise((done) => setTimeout(done))
    // Five tabs of 100 px, More's 100 px, and the 2 px between each: 610 of 700. A sixth would need 712.
    expect(stripTabs(w)).toEqual(TEACHER_TABS.slice(0, 5))
    const more = w.find('.course-tabs .course-tabs__more')
    expect(more.text()).toBe('More')
    expect(more.classes()).not.toContain('is-active')
  })

  it('lists the tabs under More as links, and marks More as the tab chosen while the page is one of them', async () => {
    narrowStrip(700)
    const w = await mountCourse({ name: 'course-members', params: { courseId: COURSE } })
    await new Promise((done) => setTimeout(done))
    const more = w.find('.course-tabs .course-tabs__more')
    expect(more.classes()).toContain('is-active')
    expect(more.attributes('aria-label')).toBe('More (now: Members)')
    expect(w.find('.course-tabs a.is-active').exists()).toBe(false)
    await more.trigger('click')
    await flushPromises()
    const links = [...document.querySelectorAll<HTMLAnchorElement>('.course-tabs__menu [role="menuitem"] a')]
    expect(links.map((a) => [a.textContent?.trim(), a.getAttribute('href')])).toEqual(
      TEACHER_TABS.slice(5).map((label) => [label, expect.stringMatching(new RegExp(`^/courses/${COURSE}`))]),
    )
    expect(links.find((a) => a.textContent?.trim() === 'Members')!.getAttribute('href')).toBe(
      `/courses/${COURSE}/members`,
    )
  })

  it('opens a tab chosen under More here, but leaves a click with a modifier key to the link', async () => {
    narrowStrip(700)
    const w = await mountCourse({ name: 'course-overview', params: { courseId: COURSE } })
    await new Promise((done) => setTimeout(done))
    const router = (w.vm as unknown as { $router: import('vue-router').Router }).$router
    await w.find('.course-tabs .course-tabs__more').trigger('click')
    await flushPromises()
    const link = () =>
      [...document.querySelectorAll<HTMLAnchorElement>('.course-tabs__menu a')].find(
        (a) => a.textContent?.trim() === 'Activity',
      )!
    // What the menu made of it, seen last, before jsdom (which opens no new tab) would follow the link.
    let leftToTheLink = false
    document.addEventListener(
      'click',
      (e) => {
        leftToTheLink = !e.defaultPrevented
        e.preventDefault()
      },
      { once: true },
    )
    link().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }))
    await flushPromises()
    expect(leftToTheLink).toBe(true)
    expect(router.currentRoute.value.name).toBe('course-overview')
    const here = new MouseEvent('click', { bubbles: true, cancelable: true })
    link().dispatchEvent(here)
    await flushPromises()
    expect(here.defaultPrevented).toBe(true)
    expect(router.currentRoute.value.name).toBe('course-activity')
  })

  it('puts every tab in the strip, which scrolls, on a phone, where the page is a phone’s', async () => {
    phoneWindow(true)
    fakeContainerWidths({ '.course-tabs': 560 })
    const w = await mountCourse({ name: 'course-overview', params: { courseId: COURSE } })
    expect(stripTabs(w)).toEqual(TEACHER_TABS)
    expect(w.find('.course-tabs').classes()).toContain('is-scrolling')
    expect(w.find('.course-tabs .course-tabs__more').exists()).toBe(false)
  })

  it('never scrolls the strip beside the docked side bar, however narrow the page: More holds the rest', async () => {
    phoneWindow(false)
    narrowStrip(544)
    const w = await mountCourse({ name: 'course-overview', params: { courseId: COURSE } })
    await new Promise((done) => setTimeout(done))
    expect(w.find('.course-tabs').classes()).not.toContain('is-scrolling')
    // Four tabs, More, and their gaps: 508 of 544.
    expect(stripTabs(w)).toEqual(TEACHER_TABS.slice(0, 4))
    expect(w.find('.course-tabs .course-tabs__more').exists()).toBe(true)
  })

  it('offers a student every one of their eight tabs, with no More', async () => {
    const w = await mountCourse({ name: 'course-overview', params: { courseId: COURSE } }, 'student')
    expect(stripTabs(w)).toEqual([
      'Overview',
      'Materials',
      'Assignments',
      'Submissions',
      'Grades',
      'Groups',
      'Activity',
      'My actions',
    ])
    expect(w.find('.course-tabs .course-tabs__more').exists()).toBe(false)
  })

  it('keeps a title that only names the tab chosen for screen readers, and shows the subtitle', async () => {
    const w = await mountCourse({ name: 'course-materials', params: { courseId: COURSE } })
    const header = w.find('.page-header')
    expect(header.classes()).toContain('is-quiet')
    expect(header.find('h1').classes()).toContain('is-quiet')
    expect(header.find('.page-header__subtitle').text()).toBe('About Materials')
  })

  it('shows a page’s own title, under the tab it belongs to', async () => {
    const w = await mountCourse({ name: 'course-document', params: { courseId: COURSE, documentId: 'D1' } })
    const header = w.find('.page-header')
    expect(header.classes()).not.toContain('is-quiet')
    expect(header.find('h1').text()).toBe('Week 1')
    expect(w.find('.course-tabs a.is-active').text()).toBe('Materials')
  })

  it('shows a group set under the Groups tab, by its own name', async () => {
    const w = await mountCourse({ name: 'course-group-set', params: { courseId: COURSE, setId: 'S1' } })
    expect(w.find('.page-header h1').text()).toBe('Project groups')
    expect(w.find('.course-tabs a.is-active').text()).toBe('Groups')
  })

  it('shows the grades’ own tabs in their pages’ header, with the student a page is about', async () => {
    const w = await mountCourse({ name: 'course-gradebook', params: { courseId: COURSE, studentMemberId: 'S1' } })
    expect(w.find('.course-tabs a.is-active').text()).toBe('Grades')
    const subs = w.findAll('.page-header .course-subtabs a')
    // The first is not "Grades" again: the tab strip and the top bar say that.
    expect(subs.map((a) => a.text())).toEqual(['All grades', 'Gradebook', 'Grading scheme'])
    expect(subs[0]!.attributes('href')).toBe(`/courses/${COURSE}/grades?student=S1`)
    expect(subs[1]!.attributes('aria-current')).toBe('page')
    expect(w.find('.page-header h1').classes()).toContain('is-quiet')
  })

  it('names a student’s own grades so in the grades’ tabs', async () => {
    const w = await mountCourse({ name: 'course-grades', params: { courseId: COURSE } }, 'student')
    const subs = w.findAll('.page-header .course-subtabs a')
    expect(subs.map((a) => a.text())).toEqual(['My grades', 'Gradebook', 'Grading scheme'])
    expect(w.find('.page-header h1').classes()).toContain('is-quiet')
  })
})
