import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as Icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import { forgetMyAgents } from './components/myAgents'
import MyActionsView from './MyActionsView.vue'

const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'
const read = vi.fn()
vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  read: (...a: unknown[]) => read(...a),
}))

const NOTE = 'Say which tests fail, and why, before the score.'
const DECIDED_AT = '2026-10-02T09:30:00Z'

/** A TA's own proposals of grades: one carried out, one sent back for changes by the instructor. */
const ACTIONS = [
  {
    id: '019a0000-0000-7000-8000-000000000001',
    actor_id: 'actor-ta',
    member_id: 'm-ta',
    action_type: 'grade.submit',
    target_type: 'submission',
    target_id: 's1',
    payload: { submission_id: 's1', score: '9' },
    authz_result: 'confirm_required',
    status: 'executed',
    review_state: 'none',
    created_at: '2026-10-01T08:00:00Z',
    decided_by_member_id: 'm-chan',
    decided_at: '2026-10-01T09:00:00Z',
  },
  {
    id: '019a0000-0000-7000-8000-000000000002',
    actor_id: 'actor-ta',
    member_id: 'm-ta',
    action_type: 'grade.submit',
    target_type: 'submission',
    target_id: 's2',
    payload: { submission_id: 's2', score: '7' },
    authz_result: 'confirm_required',
    status: 'changes_requested',
    review_state: 'none',
    created_at: '2026-10-02T08:00:00Z',
    decided_by_member_id: 'm-chan',
    decided_at: DECIDED_AT,
    result: { decision: { decision: 'request_changes', reason: NOTE, action_id: 'd2' } },
  },
]

const mounted: { unmount: () => void }[] = []
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
    if (tool === 'action.list_mine') return { actions: ACTIONS }
    if (tool === 'agent.list') return { agents: [] }
    throw new ApiError({ status: 403, code: 'forbidden', message: 'permission denied' })
  })
})
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.unstubAllGlobals()
  setLocale('en')
  document.body.innerHTML = ''
})

async function mountAsTa() {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().$patch({ me: { id: 'actor-ta', kind: 'human', display_name: 'Tam' } } as never)
  const course = useCourseStore()
  course.$patch({
    courseId: COURSE,
    course: { id: COURSE, code: 'CS101', section: 'A', title: 'Programming', status: 'active' } as never,
    membership: { member_id: 'm-ta', role: 'ta' } as never,
    perms: { grade_write: 'confirm_required', member_read: 'autonomous' },
    permsSource: 'exact',
    membersState: 'loaded',
  } as never)
  const seat = (id: string, name: string) => ({
    id,
    actor_id: `actor-${id}`,
    kind: 'human',
    status: 'active',
    display_name: name,
    role: 'instructor',
  })
  course.members = new Map([
    ['m-ta', seat('m-ta', 'Tam')],
    ['m-chan', seat('m-chan', 'Ms Chan')],
  ]) as never
  const stub = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/courses/:courseId/my-actions', name: 'course-my-actions', component: stub },
      { path: '/courses/:courseId/actions/:actionId', name: 'course-action', component: stub },
      { path: '/courses/:courseId/submissions/:submissionId', name: 'course-submission', component: stub },
    ],
  })
  await router.push(`/courses/${COURSE}/my-actions`)
  const w = mount(MyActionsView, {
    props: { courseId: COURSE },
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

const rows = () => [...document.body.querySelectorAll<HTMLElement>('.my-actions__table .el-table__body tr')]
const rowOf = (id: string) =>
  rows().find((r) => r.querySelector(`a[href$="/actions/${id}"]`)) as HTMLElement | undefined

describe('My actions, a proposal sent back for changes', () => {
  it('says what to change on its row, and who sent it back and when', async () => {
    await mountAsTa()
    const row = rowOf(ACTIONS[1]!.id)!
    expect(row).toBeDefined()
    expect(row.querySelector('.my-actions__note')!.textContent?.trim()).toBe(`What to change: ${NOTE}`)
    expect(row.textContent).toContain('Changes requested')
    // The Decided column: who, by name, and when.
    const decided = row.querySelector('.my-actions__decided')!
    expect(decided.textContent).toContain('Ms Chan')
    expect(decided.querySelector('time')!.getAttribute('datetime')).toBe(DECIDED_AT)
    // A proposal carried out has no note.
    expect(rowOf(ACTIONS[0]!.id)!.querySelector('.my-actions__note')).toBeNull()
  })

  it('is a status the filter offers, with its count, and that the filter keeps alone', async () => {
    const w = await mountAsTa()
    expect(rows()).toHaveLength(2)
    // A chip of the status filter, "All" first, each with its count.
    const chips = w.findAll('.filter-chips .filter-chip')
    expect(chips[0]!.text()).toBe('All 2')
    const sent = chips.find((c) => c.attributes('data-value') === 'changes_requested')!
    expect(sent.text()).toBe('Changes requested 1')
    expect(sent.attributes('role')).toBe('radio')
    await sent.trigger('click')
    await flushPromises()
    expect(sent.attributes('aria-checked')).toBe('true')
    expect(rows()).toHaveLength(1)
    expect(rowOf(ACTIONS[1]!.id)).toBeDefined()
  })

  it.each([
    ['zh-Hant', '需要修改：', '已退回修改'],
    ['zh-Hans', '需要修改：', '已退回修改'],
  ] as const)('is said in %s', async (locale, label, status) => {
    setLocale(locale)
    await mountAsTa()
    const row = rowOf(ACTIONS[1]!.id)!
    expect(row.querySelector('.my-actions__note')!.textContent?.trim()).toBe(`${label}${NOTE}`)
    expect(row.textContent).toContain(status)
  })
})
