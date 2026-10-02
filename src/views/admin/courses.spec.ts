import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import type { DepartmentNode } from '@/api/types'
import { fakeContainerWidths } from '@/composables/containerWidthFakes'
import { forgetDepartmentTree } from '@/composables/useDepartmentTree'
import { useSessionStore } from '@/stores/session'
import CoursesView from './CoursesView.vue'
import CreateCourseDialog from './components/CreateCourseDialog.vue'
import MoveCourseDialog from './components/MoveCourseDialog.vue'

let answers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {}
let asked: { tool: string; args: Record<string, unknown> }[] = []
const writes = vi.fn()
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn((tool: string, args: Record<string, unknown>) => {
      asked.push({ tool, args })
      const a = answers[tool]
      return a ? a(args) : Promise.reject(new Error(`no answer for ${tool}`))
    }),
    write: vi.fn((tool: string, args: Record<string, unknown>) => writes(tool, args)),
  }
})

const node = (id: string, name: string, parent: string | null, depth: number, over: Partial<DepartmentNode> = {}) =>
  ({ id, name, parent_id: parent, depth, administers: false, manages: false, appointed: false, ...over }) as DepartmentNode
// University ─┬─ Engineering (Ada) ─┬─ Computing ── AI
//             │                     └─ Design
//             └─ Humanities
const adaTree = {
  max_depth: 8,
  departments: [
    node('U', 'University', null, 1),
    node('F', 'Engineering', 'U', 2, { administers: true, appointed: true }),
    node('S', 'Computing', 'F', 3, { administers: true, manages: true }),
    node('D', 'AI', 'S', 4, { administers: true, manages: true }),
    node('S2', 'Design', 'F', 3, { administers: true, manages: true }),
    node('F2', 'Humanities', 'U', 2),
  ],
}

let router: ReturnType<typeof createRouter>
function setup() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const blank = { render: () => null }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: blank },
      { path: '/admin/courses', name: 'admin-courses', component: blank },
      { path: '/admin/courses/:courseId', name: 'admin-course', component: blank },
      { path: '/admin/terms', name: 'admin-terms', component: blank },
      { path: '/admin/departments', name: 'admin-departments', component: blank },
    ],
  })
  const session = useSessionStore()
  session.me = {
    id: 'ada',
    kind: 'human',
    display_name: 'Ada',
    status: 'active',
    administers: [{ dept_id: 'F', name: 'Engineering', appointment_id: 'ap', appointed_at: '2026-09-01T00:00:00Z' }],
  } as never
  return { global: { plugins: [pinia, router, i18n, ElementPlus], components: icons } }
}

beforeEach(() => {
  setLocale('en')
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  forgetDepartmentTree()
  asked = []
  writes.mockReset()
  answers = {
    'department.list_tree': async () => adaTree,
    'term.list': async () => ({ terms: [{ id: 'T', name: '2026/27 S1', starts_on: '2026-09-01', ends_on: '2026-12-31' }] }),
    'course.list': async () => ({ courses: [] }),
  }
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const listCalls = () => asked.filter((a) => a.tool === 'course.list').map((a) => a.args)

describe('CoursesView for a department administrator', () => {
  it('lists by one department, or by it and everything beneath it', async () => {
    const opts = setup()
    await router.push({ name: 'admin-courses', query: { dept: 'S' } })
    const w = mount(CoursesView, { attachTo: document.body, ...opts })
    await flushPromises()
    expect(w.text()).toContain('Courses in the departments you administer, and beneath them')
    expect(listCalls().at(-1)).toMatchObject({ dept_id: 'S', within_dept_id: undefined })

    await w.find('.courses__within input').setValue(true)
    await flushPromises()
    expect(router.currentRoute.value.query).toMatchObject({ dept: 'S', within: '1' })
    expect(listCalls().at(-1)).toMatchObject({ dept_id: undefined, within_dept_id: 'S' })
  })

  it('asks by term alone when no department is chosen, and offers no sub-department switch', async () => {
    const opts = setup()
    await router.push({ name: 'admin-courses', query: { term: 'T', within: '1' } })
    const w = mount(CoursesView, { attachTo: document.body, ...opts })
    await flushPromises()
    expect(listCalls().at(-1)).toMatchObject({ term_id: 'T', dept_id: undefined, within_dept_id: undefined })
    expect(w.find('.courses__within').exists()).toBe(false)
  })

  it('says terms are a platform administrator’s to make, and links nowhere for them', async () => {
    answers['term.list'] = async () => ({ terms: [] })
    const opts = setup()
    await router.push({ name: 'admin-courses' })
    const w = mount(CoursesView, { attachTo: document.body, ...opts })
    await flushPromises()
    expect(w.text()).toContain('There are no terms yet. A platform administrator creates them.')
    expect(w.findAll('a').map((a) => a.attributes('href'))).not.toContain('/admin/terms')
    // Nothing platform-only is read.
    expect(asked.map((a) => a.tool)).not.toContain('department.list')
  })

  it('folds the term and the department under the course where its card is narrow, whatever the window', async () => {
    answers['course.list'] = async () => ({
      courses: [
        {
          id: 'C1',
          code: 'CS101',
          section: 'A',
          title: 'Introduction to Programming',
          status: 'active',
          term_id: 'T',
          dept_id: 'S',
          created_at: '2026-09-01T00:00:00Z',
        },
      ],
    })
    // The window is wide (matchMedia says nothing matches); the card is what decides, measured by its toolbar.
    const sizes = fakeContainerWidths({ '.app-toolbar': 800 })
    const opts = setup()
    await router.push({ name: 'admin-courses' })
    const w = mount(CoursesView, { attachTo: document.body, ...opts })
    await flushPromises()
    const heads = () => w.findAll('th').map((th) => th.text())
    expect(heads()).toEqual(['Course', 'Status', 'Term', 'Department', 'Created'])
    expect(w.find('.courses__meta').exists()).toBe(false)

    await sizes.resize('.app-toolbar', 799)
    await flushPromises()
    expect(heads()).toEqual(['Course', 'Status'])
    expect(w.find('.courses__meta').text()).toBe('2026/27 S1 · Computing')
  })
})

describe('CreateCourseDialog', () => {
  it('offers the departments given, indented, and makes the course in the one chosen', async () => {
    const opts = setup()
    const w = mount(CreateCourseDialog, {
      props: {
        modelValue: true,
        terms: [{ id: 'T', name: '2026/27 S1', starts_on: '2026-09-01', ends_on: '2026-12-31' }] as never,
        departments: [
          { node: { id: 'F', name: 'Engineering' }, indent: 0 },
          { node: { id: 'S', name: 'Computing' }, indent: 1 },
        ],
        deptId: 'S',
      },
      attachTo: document.body,
      ...opts,
    })
    await flushPromises()
    writes.mockResolvedValue({ status: 'executed', actionId: 'a', reviewState: 'none', result: { course_id: 'C', root_component_id: 'R' }, replayed: false })
    const inputs = [...document.body.querySelectorAll<HTMLInputElement>('.el-dialog input')]
    // Code, section, title (the selects have inputs of their own before them).
    const byPlaceholder = (p: string) => inputs.find((i) => i.placeholder === p)!
    for (const [p, v] of [
      ['CS101', 'AI501'],
      ['Introduction to Programming', 'Machine Learning'],
    ]) {
      const i = byPlaceholder(p)
      i.value = v
      i.dispatchEvent(new Event('input'))
    }
    await flushPromises()
    ;[...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Create course')!.click()
    await flushPromises()
    expect(writes).toHaveBeenCalledWith('course.create', expect.objectContaining({ dept_id: 'S', term_id: 'T', code: 'AI501' }))
    expect(w.emitted('created')).toEqual([['C']])
  })
})

describe('MoveCourseDialog', () => {
  it('moves a course to a department its administrator administers, and not to where it is', async () => {
    const opts = setup()
    const w = mount(MoveCourseDialog, {
      props: { modelValue: true, course: { id: 'C', dept_id: 'D', code: 'AI501', section: '' } },
      attachTo: document.body,
      ...opts,
    })
    await flushPromises()
    expect(document.body.textContent).toContain('University › Engineering › Computing › AI')
    const picker = w.findComponent({ name: 'ElTreeSelect' })
    const data = picker.props('data') as { value: string; disabled: boolean; children?: unknown[] }[]
    const flat = (ds: typeof data): typeof data => ds.flatMap((d) => [d, ...flat((d.children ?? []) as typeof data)])
    expect(flat(data).map((d) => d.value)).toEqual(['F', 'S', 'D', 'S2'])
    expect(flat(data).find((d) => d.value === 'D')?.disabled).toBe(true)

    writes.mockResolvedValue({ status: 'executed', actionId: 'a', reviewState: 'none', result: { ok: true }, replayed: false })
    picker.vm.$emit('update:modelValue', 'S2')
    await flushPromises()
    ;[...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Move')!.click()
    await flushPromises()
    expect(writes).toHaveBeenCalledWith('course.move', { course_id: 'C', dept_id: 'S2' })
    expect(w.emitted('moved')).toEqual([['S2']])
    expect(document.body.textContent).toContain('Moved to Design')
  })
})
