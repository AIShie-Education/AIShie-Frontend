import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as Icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import { forgetMyAgents } from './components/myAgents'
import ActionView from './ActionView.vue'

const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'
const ACTION = '01a0d79f-0000-70da-a7cc-0000000000a1'
const read = vi.fn()
vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  read: (...a: unknown[]) => read(...a),
  write: vi.fn(),
}))

/** A TA's grade, entered pending review, and reviewed since. */
const ACTION_ROW = {
  id: ACTION,
  actor_id: 'actor-ta',
  member_id: 'm-ta',
  action_type: 'grade.submit',
  target_type: 'submission',
  target_id: 's1',
  payload: { submission_id: 's1', score: '9.5', feedback: 'Good' },
  authz_result: 'pending_review',
  status: 'executed',
  review_state: 'reviewed',
  created_at: '2026-09-28T10:00:00Z',
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  forgetMyAgents()
  read.mockReset()
  read.mockImplementation(async (tool: string) => {
    if (tool === 'action.get') return ACTION_ROW
    throw new ApiError({ status: 403, code: 'forbidden', message: 'permission denied' })
  })
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  setLocale('en')
  document.body.innerHTML = ''
})

async function page() {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().$patch({ me: { id: 'actor-mei', kind: 'human', display_name: 'Mei' } } as never)
  useCourseStore().$patch({
    courseId: COURSE,
    course: { id: COURSE, code: 'CS101', section: 'A', title: 'Programming', status: 'active' } as never,
    membership: { member_id: 'm-mei', role: 'instructor' } as never,
    perms: { document_read: 'autonomous', action_decide: 'autonomous', member_read: 'denied' },
    permsSource: 'exact',
  } as never)
  const stub = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:any(.*)*', name: 'any', component: stub }].concat(
      [
        'course-approvals',
        'course-my-actions',
        'course-action',
        'course-submission',
        'course-assignment',
        'course-grade',
        'course-member',
        'course-activity',
      ].map((name) => ({ path: `/x/${name}/:a?/:b?/:c?`, name, component: stub })),
    ),
  })
  const w = mount(ActionView, {
    props: { courseId: COURSE, actionId: ACTION },
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
  await flushPromises()
  await vi.waitFor(() => expect(w.find('.action-view__facts').exists()).toBe(true))
  return w
}

describe('ActionView', () => {
  it('says its status and its review once, under Status in its facts, never again beside its title', async () => {
    const w = await page()
    const header = w.find('.page-header')
    expect(header.text()).toContain('Enter a grade')
    expect(header.find('.status-tag, .el-tag').exists()).toBe(false)
    expect(header.text()).not.toContain('Executed')
    expect(header.text()).not.toContain('Reviewed')
    const status = w
      .findAll('.action-view__facts > div')
      .find((d) => d.find('dt').text() === 'Status')!
      .find('dd')
    expect(status.text()).toContain('Executed')
    expect(status.text()).toContain('Reviewed')
  })
})
