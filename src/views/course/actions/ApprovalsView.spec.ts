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
import ApprovalsView from './ApprovalsView.vue'

const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'
const read = vi.fn()
const write = vi.fn()
vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  read: (...a: unknown[]) => read(...a),
  write: (...a: unknown[]) => write(...a),
}))
const confirm = vi.fn(async () => 'confirm')
vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessageBox: { ...real.ElMessageBox, confirm: (...a: unknown[]) => confirm(...(a as [])) } }
})

const forbidden = () => new ApiError({ status: 403, code: 'forbidden', message: 'permission denied' })

/** A proposal of Mei's agent, as her queue lists it. */
function proposal(id: string, yours: boolean, type = 'submission.create') {
  return {
    id,
    actor_id: 'actor-helper',
    member_id: 'm-helper',
    action_type: type,
    target_type: 'assignment',
    target_id: 'hw1',
    payload: { assignment_id: 'hw1', body: 'My converter' },
    authz_result: 'confirm_required',
    status: 'proposed',
    review_state: 'none',
    created_at: '2026-09-28T10:00:00Z',
    yours_to_decide: yours,
  }
}

function answer(queue: unknown[]) {
  read.mockImplementation(async (tool: string) => {
    switch (tool) {
      case 'action.list_proposed':
        return { actions: queue }
      case 'action.list_pending_review':
        // A queue Core will not show: nothing in it is hers.
        throw forbidden()
      case 'agent.list':
        return { agents: [{ actor_id: 'actor-helper', display_name: 'Mei’s helper' }] }
    }
    throw forbidden()
  })
}

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
  write.mockReset()
  confirm.mockClear()
})
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.unstubAllGlobals()
  setLocale('en')
  document.body.innerHTML = ''
})

async function mountAsStudent() {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().$patch({ me: { id: 'actor-mei', kind: 'human', display_name: 'Mei' } } as never)
  const course = useCourseStore()
  course.$patch({
    courseId: COURSE,
    course: { id: COURSE, code: 'CS101', section: 'A', title: 'Programming', status: 'active' } as never,
    membership: { member_id: 'm-mei', role: 'student' } as never,
    perms: {
      document_read: 'autonomous',
      submission_write: 'autonomous',
      action_decide: 'denied',
      member_read: 'denied',
    },
    permsSource: 'exact',
    ownsAgentHere: true,
  } as never)
  const stub = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/courses/:courseId/approvals', name: 'course-approvals', component: stub },
      { path: '/courses/:courseId/actions/:actionId', name: 'course-action', component: stub },
      { path: '/courses/:courseId/my-actions', name: 'course-my-actions', component: stub },
      { path: '/courses/:courseId/assignments/:assignmentId', name: 'course-assignment', component: stub },
      { path: '/courses/:courseId/submissions/:submissionId', name: 'course-submission', component: stub },
    ],
  })
  await router.push(`/courses/${COURSE}/approvals`)
  const w = mount(ApprovalsView, {
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

const cards = () => [...document.body.querySelectorAll<HTMLElement>('.action-card')]
const button = (root: ParentNode, name: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined

describe('ApprovalsView, for a student who owns an agent', () => {
  it('is titled as her agents’ proposals, and shows a queue she may not read as empty, not as an error', async () => {
    answer([proposal('p1', true)])
    await mountAsStudent()
    expect(document.body.querySelector('.page-header')!.textContent).toContain('Your agents’ proposals')
    expect(document.body.textContent).not.toContain('permission denied')
    expect(read).toHaveBeenCalledWith('action.list_pending_review', { course_id: COURSE, limit: 50, after: undefined })
    // The review tab (rendered, if hidden): nothing there for her.
    expect(document.body.textContent).toContain('Nothing your agents did is waiting for review.')
    expect(document.body.querySelector('.el-result')).toBeNull()
  })

  it('names her agent without the member list, and lets her approve what she could have done herself', async () => {
    answer([proposal('p1', true)])
    await mountAsStudent()
    const [card] = cards()
    expect(card!.textContent).toContain('Mei’s helper')
    expect(card!.textContent).toContain('Your agent')
    expect(button(card!, 'Approve')!.disabled).toBe(false)
    // Her decision is her own doing, at once: never a proposal of hers.
    expect(card!.textContent).not.toContain('Needs approval')
    write.mockResolvedValueOnce({
      status: 'executed',
      actionId: 'd1',
      reviewState: 'none',
      replayed: false,
      result: { action_id: 'p1', outcome: 'executed', result: { submission_id: 's1' }, by_owner: true },
    })
    answer([])
    button(card!, 'Approve')!.click()
    await flushPromises()
    expect(document.body.textContent).toContain('You decide this as its owner')
    button(document.body, 'Approve now')!.click()
    await flushPromises()
    expect(write).toHaveBeenCalledWith(
      'action.decide',
      { course_id: COURSE, action_id: 'p1', decision: 'approve', reason: undefined },
      expect.anything(),
    )
    expect(document.body.querySelector('.approvals__recent')!.textContent).toContain(
      'You decided this as the owner of the agent that proposed it',
    )
  })

  it('says why one is not hers to decide, and lets her withdraw it', async () => {
    answer([proposal('p2', false, 'grade.submit')])
    await mountAsStudent()
    const [card] = cards()
    // One sentence says who decides it, and nothing is offered to press but withdrawing it.
    expect(button(card!, 'Approve')).toBeFalsy()
    expect(button(card!, 'Reject')).toBeFalsy()
    expect(card!.querySelector('.decide-panel__blocked')!.textContent).toContain(
      'Decided by the course’s teaching staff: you could not do this yourself without someone’s confirmation',
    )
    write.mockResolvedValueOnce({
      status: 'executed',
      actionId: 'w1',
      reviewState: 'none',
      replayed: false,
      result: { ok: true },
    })
    answer([])
    button(card!, 'Withdraw')!.click()
    await flushPromises()
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('Your agent learns that you took it back'),
      'Withdraw your agent’s proposal?',
      expect.anything(),
    )
    expect(write).toHaveBeenCalledWith('action.withdraw', { course_id: COURSE, action_id: 'p2' }, expect.anything())
    expect(cards()).toHaveLength(0)
    expect(document.body.querySelector('.approvals__recent')!.textContent).toContain(
      'Withdrawn: nothing of it was carried out',
    )
  })

  it('says it in the reader’s language', async () => {
    setLocale('zh-Hant')
    answer([])
    await mountAsStudent()
    expect(document.body.querySelector('.page-header')!.textContent).toContain('你的代理的提案')
    expect(document.body.textContent).toContain('你的代理沒有待批准的提案。')
  })
})
