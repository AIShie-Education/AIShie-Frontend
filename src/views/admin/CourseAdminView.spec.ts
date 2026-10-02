import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { fakeContainerWidths } from '@/composables/containerWidthFakes'
import { forgetDepartmentTree } from '@/composables/useDepartmentTree'
import { useSessionStore } from '@/stores/session'
import CourseAdminView from './CourseAdminView.vue'

// The mock below is hoisted above the file's imports, and the course with it.
const { COURSE } = vi.hoisted(() => ({ COURSE: '01a0d79f-0000-70da-a7cc-0000000000c1' }))
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  const answers: Record<string, unknown> = {
    'course.list': {
      courses: [
        {
          id: COURSE,
          code: 'COMP1001',
          section: 'A',
          title: 'Programming',
          term_id: 'T',
          dept_id: 'S',
          status: 'active',
          description: '',
          created_at: '2026-09-01T00:00:00Z',
        },
      ],
    },
    'term.list': { terms: [{ id: 'T', name: '2026/27 S1', starts_on: '2026-09-01', ends_on: '2026-12-31' }] },
    'department.list_tree': {
      max_depth: 8,
      departments: [
        { id: 'S', name: 'Computing', parent_id: null, depth: 1, administers: true, manages: true, appointed: false },
      ],
    },
  }
  return {
    ...real,
    read: vi.fn((tool: string) =>
      tool in answers ? Promise.resolve(answers[tool]) : Promise.reject(new Error(`no answer for ${tool}`)),
    ),
  }
})

beforeEach(() => {
  setLocale('en')
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  forgetDepartmentTree()
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('a course’s administration', () => {
  it('lays its details out by their card’s width, not the window’s', async () => {
    // The window is wide (matchMedia says nothing matches); the details' card is what decides, measured by its title.
    const sizes = fakeContainerWidths({ '.app-card__title': 540 })
    const pinia = createPinia()
    setActivePinia(pinia)
    useSessionStore().me = {
      id: 'root',
      kind: 'human',
      display_name: 'Root',
      status: 'active',
      platform_role: 'root',
    } as never
    const blank = { render: () => null }
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'home', component: blank },
        { path: '/admin/courses', name: 'admin-courses', component: blank },
      ],
    })
    const w = mount(CourseAdminView, {
      props: { courseId: COURSE },
      attachTo: document.body,
      global: {
        plugins: [pinia, router, i18n, ElementPlus],
        components: icons,
        stubs: { SeatInstructorCard: true, EditCourseDialog: true, MoveCourseDialog: true },
      },
    })
    await flushPromises()
    const cellsInRow = () => w.findAll('.course-admin__desc tbody tr')[0]!.findAll('th, td').length
    // Room for two columns of facts, a label and its value each, and the whole ID: from 540 px.
    expect(cellsInRow()).toBe(4)
    expect(w.find('.course-admin__desc').text()).toContain(COURSE)
    await sizes.resize('.app-card__title', 539)
    await flushPromises()
    expect(cellsInRow()).toBe(2)
    expect(w.find('.course-admin__desc').text()).not.toContain(COURSE)
  })
})
