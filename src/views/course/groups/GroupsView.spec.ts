import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as Icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import { useCourseStore } from '@/stores/course'
import GroupsView from './GroupsView.vue'

const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'
const read = vi.fn()
const write = vi.fn()
vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  read: (...a: unknown[]) => read(...a),
  write: (...a: unknown[]) => write(...a),
}))
const T0 = '2026-10-05T09:00:00Z'

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  read.mockReset()
  write.mockReset()
})
const mounted: { unmount: () => void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.unstubAllGlobals()
  setLocale('en')
  document.body.innerHTML = ''
})

async function mountAs(role: 'instructor' | 'student' | 'ta', sets: unknown[], studentScope = 'all') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const course = useCourseStore()
  course.$patch({
    courseId: COURSE,
    course: { id: COURSE, code: 'CS101', section: 'A', title: 'Programming', status: 'active' } as never,
    membership: {
      member_id: role === 'student' ? 'm-ana' : 'm-chan',
      role,
      student_scope: studentScope,
      assignment_scope: 'all',
    } as never,
    perms:
      role === 'student'
        ? { document_read: 'autonomous' }
        : { document_read: 'autonomous', assignment_write: 'confirm_required', member_read: 'autonomous' },
    permsSource: 'exact',
  } as never)
  read.mockImplementation(async (tool: string) => {
    if (tool === 'group_set.list') return { sets: structuredClone(sets) }
    throw new ApiError({ status: 403, code: 'forbidden', message: 'permission denied' })
  })
  const stub = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/courses/:courseId/groups', name: 'course-groups', component: stub },
      { path: '/courses/:courseId/groups/:setId', name: 'course-group-set', component: stub },
      { path: '/courses/:courseId/assignments/:assignmentId', name: 'course-assignment', component: stub },
      { path: '/courses/:courseId/actions/:actionId', name: 'course-action', component: stub },
    ],
  })
  await router.push(`/courses/${COURSE}/groups`)
  const w = mount(GroupsView, {
    props: { courseId: COURSE },
    attachTo: document.body,
    global: { plugins: [pinia, i18n, ElementPlus, router], components: Icons },
  })
  mounted.push(w)
  await flushPromises()
  return w
}

const projects = {
  id: 's1',
  name: 'Project groups',
  description: 'Four or five each',
  signup: { open: true, joinable: true, closes_at: '2026-10-08T15:59:00Z' },
  created_at: T0,
  updated_at: T0,
  unassigned_count: 3,
  assignments: [
    { assignment_id: 'a1', title: 'Report', published: true },
    { assignment_id: 'a2', title: 'Poster', published: false },
  ],
  groups: [
    { id: 'g1', name: 'Group 1', size: 2, full: false, created_at: T0 },
    { id: 'g2', name: 'Group 2', size: 2, full: false, created_at: T0 },
    { id: 'g3', name: 'Old', size: 0, full: false, created_at: T0, archived_at: T0 },
  ],
}

describe('the course’s groups, for staff', () => {
  it('lists each set with its groups, those in no group, its sign-up and the assignments using it', async () => {
    const w = await mountAs('instructor', [projects])
    expect(read).toHaveBeenCalledWith('group_set.list', { course_id: COURSE, include_archived: undefined })
    const row = w.find('.groups__row')
    expect(row.find('.groups__name').text()).toBe('Project groups')
    expect(row.find('.groups__facts').text()).toBe('2 groups · 3 students in no group')
    expect(row.find('.groups__signup').text()).toContain('Sign-up open')
    expect(row.find('.groups__used').text()).toBe('Used by: Report and Poster (not published)')
    // Making a set waits for approval at this seat's level, and says so.
    expect(w.find('.page-header').text()).toContain('New group set')
    expect(w.find('.page-header .app-level-tag').exists()).toBe(true)
  })

  it('says so where there is none yet', async () => {
    const w = await mountAs('instructor', [])
    expect(w.text()).toContain('No group sets yet.')
  })

  it('says everyone is in a group only where the seat reaches every student', async () => {
    const w = await mountAs('instructor', [{ ...projects, unassigned_count: 0 }])
    expect(w.find('.groups__facts').text()).toBe('2 groups · Everyone is in a group')
  })

  it('counts, to a seat listed to some students, those it reaches, and says so', async () => {
    // Core counts only the students the seat reaches: none of them is in no group, whoever else is.
    let w = await mountAs('ta', [{ ...projects, unassigned_count: 0 }], 'listed')
    expect(w.find('.groups__facts').text()).toBe('2 groups · Every student you reach is in a group')
    expect(w.text()).not.toContain('Everyone is in a group')
    w.unmount()
    w = await mountAs('ta', [projects], 'listed')
    expect(w.find('.groups__facts').text()).toBe('2 groups · 3 students you reach in no group')
    w.unmount()
    setLocale('zh-Hant')
    w = await mountAs('ta', [{ ...projects, unassigned_count: 0 }], 'listed')
    expect(w.find('.groups__facts').text()).toContain('你權限範圍內的學生均已分組')
    expect(w.text()).not.toContain('所有學生均已分組')
  })
})

describe('the course’s groups, for a student', () => {
  it('shows their own group and its other members, and nothing to form groups with', async () => {
    const mine = {
      ...projects,
      unassigned_count: undefined,
      assignments: [{ assignment_id: 'a1', title: 'Report', published: true }],
      my_group_id: 'g1',
      groups: [
        {
          id: 'g1',
          name: 'Group 1',
          size: 2,
          full: false,
          created_at: T0,
          members: [
            { member_id: 'm-ana', display_name: 'Ana Lee' },
            { member_id: 'm-ben', display_name: 'Ben Ho' },
          ],
        },
        { id: 'g2', name: 'Group 2', size: 2, full: false, created_at: T0 },
      ],
    }
    const w = await mountAs('student', [
      mine,
      { ...projects, id: 's2', name: 'Lab groups', my_group_id: null, groups: [] },
    ])
    const rows = w.findAll('.groups__row')
    expect(rows[0].find('.groups__facts').text()).toBe('Your group: Group 1 with Ben Ho')
    expect(rows[1].find('.groups__facts').text()).toBe('You are in no group of this set.')
    expect(w.text()).not.toContain('New group set')
    expect(w.text()).not.toContain('Show archived sets')
    expect(w.text()).not.toContain('in no group:')
  })
})
