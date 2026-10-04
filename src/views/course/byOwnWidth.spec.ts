import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as Icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Component } from 'vue'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import { fakeContainerWidths } from '@/composables/containerWidthFakes'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import MembersView from './members/MembersView.vue'
import MemberView from './members/MemberView.vue'
import MyActionsView from './actions/MyActionsView.vue'
import AssignmentsView from './assignments/AssignmentsView.vue'
import GradesView from './grades/GradesView.vue'
import GradebookView from './grades/GradebookView.vue'
import SubmissionsView from './submissions/SubmissionsView.vue'

// A course's pages switch their layout on their own width, not the window's
// (the window is wide here: matchMedia matches nothing). Each is pinned at its
// threshold: the wide layout at one pixel more, the narrow one at it. The
// thresholds are where a window of 767 px (the members, a member's page, My
// actions) or of 640 px (the rest) left the page without the side bar, so
// that without it nothing changes (docs/CONVENTIONS.md).

const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'
const read = vi.fn()
vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  read: (...a: unknown[]) => read(...a),
  write: vi.fn(),
}))

const forbidden = () => new ApiError({ status: 403, code: 'forbidden', message: 'permission denied' })
let answers: Record<string, () => unknown> = {}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  answers = {}
  denied = []
  read.mockReset()
  read.mockImplementation(async (tool: string) => {
    const a = answers[tool]
    if (a) return a()
    throw forbidden()
  })
})
const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.unstubAllGlobals()
  setLocale('en')
  document.body.innerHTML = ''
})

const SEAT = { member_id: 'm-sato', role: 'instructor', assignment_scope: 'all', student_scope: 'all' }
/** What the seat may not do; everything else it does on its own. */
let denied: string[] = []

/** The instructor, on one of the course's pages, by path. */
async function mountPage(view: Component, path: string, props: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().$patch({ me: { id: 'actor-sato', kind: 'human', display_name: 'Sato' } } as never)
  useCourseStore().$patch({
    courseId: COURSE,
    course: { id: COURSE, code: 'CS101', section: 'A', title: 'Programming', status: 'active' } as never,
    membership: SEAT as never,
    perms: new Proxy({}, { get: (_, p) => (denied.includes(String(p)) ? 'denied' : 'autonomous') }) as never,
    permsSource: 'exact',
  } as never)
  const stub = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:any(.*)*', name: 'any', component: stub }],
  })
  // Every named route the pages link to, to the same stub.
  for (const name of [
    'course-members',
    'course-member',
    'course-my-actions',
    'course-action',
    'course-assignments',
    'course-assignment',
    'course-grades',
    'course-grade',
    'course-gradebook',
    'course-submissions',
    'course-submission',
    'course-approvals',
  ])
    router.addRoute({ path: `/${name}/:a?/:b?/:c?`, name, component: stub })
  await router.push(path)
  const w = mount(view, {
    props: { courseId: COURSE, ...props },
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
  await flushPromises()
  return w
}

const heads = (w: VueWrapper, table: string) => w.findAll(`${table} thead th`).map((th) => th.text().trim())

describe('the members', () => {
  it('fold role and status under the name where the list’s toolbar is 669 px or less (719 of page)', async () => {
    answers['member.list'] = () => ({
      members: [
        {
          id: 'm-yuki',
          actor_id: 'a-yuki',
          display_name: 'Yuki Tanaka',
          kind: 'human',
          role: 'student',
          status: 'active',
          student_scope: 'self',
          assignment_scope: 'all',
          joined_at: '2026-09-01T00:00:00Z',
        },
      ],
      next: null,
    })
    const sizes = fakeContainerWidths({ '.app-toolbar': 670 })
    const w = await mountPage(MembersView, '/members')
    expect(heads(w, '.members__table')).toContain('Role')
    expect(w.find('.members__stack').exists()).toBe(false)
    await sizes.resize('.app-toolbar', 669)
    await flushPromises()
    expect(heads(w, '.members__table')).toEqual(['Name', 'Reach'])
    expect(w.find('.members__stack').exists()).toBe(true)
  })
})

describe('a member’s page', () => {
  it('lays the seat’s facts out in one column where its title is 669 px or less (719 of page)', async () => {
    answers['member.get'] = () => ({
      id: 'm-yuki',
      actor_id: 'a-yuki',
      display_name: 'Yuki Tanaka',
      kind: 'human',
      role: 'student',
      status: 'active',
      student_scope: 'self',
      assignment_scope: 'all',
      joined_at: '2026-09-01T00:00:00Z',
      perms: {},
    })
    const sizes = fakeContainerWidths({ '.app-card__title': 670 })
    const w = await mountPage(MemberView, '/members/m-yuki', { memberId: 'm-yuki' })
    const desc = () => w.find('.member__desc')
    expect(desc().exists()).toBe(true)
    expect(desc().classes()).not.toContain('is-narrow')
    await sizes.resize('.app-card__title', 669)
    await flushPromises()
    expect(desc().classes()).toContain('is-narrow')
  })
})

describe('My actions', () => {
  it('folds status and when under each action where the help above them is 669 px or less (719 of page)', async () => {
    answers['action.list_mine'] = () => ({
      actions: [
        {
          id: 'act-1',
          action_type: 'submission.create',
          target_type: 'assignment',
          target_id: 'hw1',
          status: 'executed',
          review_state: 'none',
          created_at: '2026-09-28T10:00:00Z',
          decided_at: '2026-09-28T10:00:00Z',
        },
      ],
      next: null,
    })
    const sizes = fakeContainerWidths({ '.my-actions__help': 670 })
    const w = await mountPage(MyActionsView, '/my-actions')
    expect(heads(w, '.my-actions__table')).toContain('Status')
    await sizes.resize('.my-actions__help', 669)
    await flushPromises()
    expect(heads(w, '.my-actions__table')).toEqual(['Action'])
    expect(w.find('.my-actions__stack').exists()).toBe(true)
  })
})

describe('the assignments', () => {
  it('keep the title and the due date, the rest under the title, where the page’s header is 592 px or less', async () => {
    answers['assignment.list'] = () => ({
      assignments: [
        {
          id: 'hw1',
          title: 'HW1',
          status: 'published',
          due_at: '2026-10-10T00:00:00Z',
          points_possible: '10',
          component_id: null,
        },
      ],
      next: null,
    })
    const sizes = fakeContainerWidths({ '.page-header': 593 })
    const w = await mountPage(AssignmentsView, '/assignments')
    expect(heads(w, '.assignments-view__table')).toContain('Points')
    await sizes.resize('.page-header', 592)
    await flushPromises()
    // And, for whoever writes assignments, the ⋯ of each row, with no heading where it is narrow.
    expect(heads(w, '.assignments-view__table')).toEqual(['Assignment', 'Due', ''])
    expect(w.find('.assignments-view__meta').exists()).toBe(true)
  })
})

describe('the grades', () => {
  it('are a card each where the list’s toolbar is 542 px or less (592 of page)', async () => {
    answers['grade.list'] = () => ({
      grades: [
        {
          id: 'g1',
          assignment_id: 'hw1',
          component_id: null,
          student_member_id: 'm-yuki',
          grader_member_id: 'm-sato',
          score: '9',
          points_possible: '10',
          state: 'draft',
          created_at: '2026-09-28T10:00:00Z',
        },
      ],
      next: null,
    })
    const sizes = fakeContainerWidths({ '.app-toolbar': 543 })
    const w = await mountPage(GradesView, '/grades')
    expect(w.find('.grades-list').exists()).toBe(false)
    expect(w.findAll('.el-table').length).toBeGreaterThan(0)
    await sizes.resize('.app-toolbar', 542)
    await flushPromises()
    expect(w.find('.grades-list').exists()).toBe(true)
    expect(w.findAll('.el-table')).toHaveLength(0)
  })
})

describe('the submissions', () => {
  const submission = {
    id: 's1',
    assignment_id: 'hw1',
    student_member_id: 'm-yuki',
    attempt: 1,
    state: 'submitted',
    submitted_at: '2026-09-28T10:00:00Z',
  }

  it('are a card each where the toolbar is 592 px or less (as on a phone’s page)', async () => {
    answers['submission.list'] = () => ({ submissions: [submission], next: null })
    const sizes = fakeContainerWidths({ '.app-toolbar': 593 })
    const w = await mountPage(SubmissionsView, '/submissions')
    expect(w.find('.submissions-table').exists()).toBe(true)
    expect(w.find('.submission-cards').exists()).toBe(false)
    await sizes.resize('.app-toolbar', 592)
    await flushPromises()
    expect(w.find('.submission-cards').exists()).toBe(true)
    expect(w.find('.submissions-table').exists()).toBe(false)
  })

  it('and an assignment’s roster a card each where its summary is 566 px or less (its card padded 12 px)', async () => {
    answers['submission.roster'] = () => ({
      students: [
        {
          student_member_id: 'm-yuki',
          display_name: 'Yuki Tanaka',
          member_status: 'active',
          state: 'submitted',
          submission_id: 's1',
          attempt: 1,
          submitted_at: '2026-09-28T10:00:00Z',
        },
      ],
      next: null,
    })
    const sizes = fakeContainerWidths({ '.roster-summary': 567 })
    const w = await mountPage(SubmissionsView, '/submissions?assignment=hw1')
    expect(w.find('.roster-table').exists()).toBe(true)
    expect(w.find('.roster-cards').exists()).toBe(false)
    await sizes.resize('.roster-summary', 566)
    await flushPromises()
    expect(w.find('.roster-cards').exists()).toBe(true)
    expect(w.find('.roster-table').exists()).toBe(false)
  })
})

describe('a student’s gradebook', () => {
  function book() {
    answers['component.tree'] = () => ({
      components: [
        { id: 'root', parent_id: null, name: 'Course', points_possible: null, drop_lowest: 0 },
        { id: 'mid', parent_id: 'root', name: 'Midterm', points_possible: '100', drop_lowest: 0 },
      ],
    })
    answers['gradebook.get'] = () => ({
      components: [
        {
          component_id: 'root',
          name: 'Course',
          fraction: null,
          percent: null,
          override_percent: null,
          complete: false,
          items: [{ id: 'mid', kind: 'component', weight: '40', fraction: null }],
        },
        {
          component_id: 'mid',
          name: 'Midterm',
          fraction: null,
          percent: null,
          override_percent: null,
          complete: false,
          items: [],
        },
      ],
    })
  }

  it('folds what its columns say under each line’s name where the breakdown’s title is 929 px or less, keeping all of it', async () => {
    book()
    // Someone who reads grades but does not grade them: no actions column.
    denied = ['grade_submit', 'grade_post']
    const sizes = fakeContainerWidths({ '.gradebook__body .app-card__title': 930 })
    const w = await mountPage(GradebookView, '/gradebook/m-yuki', { studentMemberId: 'm-yuki' })
    expect(heads(w, '.gradebook__table')).toContain('Score')
    expect(w.find('.gradebook__sub').exists()).toBe(false)
    await sizes.resize('.gradebook__body .app-card__title', 929)
    await flushPromises()
    expect(heads(w, '.gradebook__table')).toEqual(['Component or assignment', 'Result'])
    // What the score and status columns said of the midterm, nothing graded yet: its points, and nothing posted.
    const sub = w.findAll('.gradebook__sub').map((s) => s.text())
    expect(sub.some((s) => s.includes('— / 100') && s.includes('No posted grades yet'))).toBe(true)
  })

  it('folds at 1059 px for a grader, whose actions take a column more', async () => {
    book()
    const sizes = fakeContainerWidths({ '.gradebook__body .app-card__title': 1060 })
    const w = await mountPage(GradebookView, '/gradebook/m-yuki', { studentMemberId: 'm-yuki' })
    expect(heads(w, '.gradebook__table')).toContain('Total')
    await sizes.resize('.gradebook__body .app-card__title', 1059)
    await flushPromises()
    expect(heads(w, '.gradebook__table')).toEqual(['Component or assignment', 'Result'])
  })
})
