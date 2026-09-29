import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import { forgetDepartmentTree } from '@/composables/useDepartmentTree'
import { useSessionStore } from '@/stores/session'
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
