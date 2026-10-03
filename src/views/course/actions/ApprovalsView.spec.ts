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

function answer(queue: unknown[], reviews?: unknown[]) {
  read.mockImplementation(async (tool: string) => {
    switch (tool) {
      case 'action.list_proposed':
        return { actions: queue }
      case 'action.list_pending_review':
        // A queue Core will not show: nothing in it is hers.
        if (reviews) return { actions: reviews }
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
  localStorage.clear()
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

/** The course's members, where Mei may read them: her seat, her agent's, and who decides. */
function member(id: string, name: string, extra: Record<string, unknown> = {}) {
  return { id, actor_id: `actor-${id}`, kind: 'human', status: 'active', display_name: name, role: 'instructor', ...extra }
}
const DECIDES = { perms: { action_decide: 'autonomous' } }

/** Mei, a student who owns an agent here and decides nothing. */
const mountAsStudent = (members?: ReturnType<typeof member>[]) => mountAs('student', members)

/** Mei as a student, or as an instructor whose seat decides. */
async function mountAs(role: 'student' | 'instructor', members?: ReturnType<typeof member>[]) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().$patch({ me: { id: 'actor-mei', kind: 'human', display_name: 'Mei' } } as never)
  const course = useCourseStore()
  course.$patch({
    courseId: COURSE,
    course: { id: COURSE, code: 'CS101', section: 'A', title: 'Programming', status: 'active' } as never,
    membership: { member_id: 'm-mei', role } as never,
    perms: {
      document_read: 'autonomous',
      submission_write: 'autonomous',
      action_decide: role === 'instructor' ? 'autonomous' : 'denied',
      member_read: members ? 'autonomous' : 'denied',
    },
    permsSource: 'exact',
    ownsAgentHere: role === 'student',
  } as never)
  if (members) {
    course.members = new Map(members.map((m) => [m.id, m])) as never
    course.$patch({ membersState: 'loaded' } as never)
  }
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
    // Neither Core's refusal nor the app's own words for one.
    expect(document.body.textContent).not.toContain('permission denied')
    expect(document.body.textContent).not.toContain('You do not have permission')
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

  it('names who decides, where she may read the course’s members', async () => {
    answer([proposal('p2', false, 'grade.submit')])
    await mountAsStudent([
      member('m-mei', 'Mei', { role: 'student' }),
      member('m-helper', 'Mei’s helper', { kind: 'agent', role: 'student', owner_actor_id: 'actor-mei' }),
      member('m-lin', 'Lin Wen', DECIDES),
      member('m-sato', 'Sato Ken', DECIDES),
      // Neither a former member nor a seat that decides nothing is named.
      member('m-old', 'Old Hand', { ...DECIDES, status: 'removed' }),
      member('m-ta', 'Tess', { perms: { action_decide: 'denied' } }),
    ])
    const [card] = cards()
    expect(card!.querySelector('.decide-panel__blocked')!.textContent).toContain(
      'Decided by Lin Wen and Sato Ken: you could not do this yourself without someone’s confirmation',
    )
  })

  it('says who reviews what her agent did, in the review queue, without a refusal that is a proposal’s', async () => {
    answer([], [{ ...proposal('r1', false, 'grade.submit'), status: 'executed', review_state: 'pending' }])
    await mountAsStudent()
    const [card] = cards()
    const said = card!.querySelector('.decide-panel__blocked')!.textContent!
    expect(said).toContain(
      'Reviewed by the course’s teaching staff: you could not have done this yourself without someone’s confirmation.',
    )
    expect(said).not.toContain('refused')
    expect(button(card!, 'Mark reviewed')).toBeFalsy()
  })

  it('says it in the reader’s language', async () => {
    setLocale('zh-Hant')
    answer([])
    await mountAsStudent()
    expect(document.body.querySelector('.page-header')!.textContent).toContain('你的代理的提案')
    expect(document.body.textContent).toContain('你的代理沒有待批准的提案。')
  })
})

describe('ApprovalsView’s rules', () => {
  const toggle = () => document.body.querySelector<HTMLButtonElement>('.approvals__rules-toggle')!
  const rules = () => document.body.querySelector<HTMLElement>('#approvals-rules')!
  const shown = () => rules().style.display !== 'none'

  it('are open the first time the page is shown in this browser, and closed after that', async () => {
    answer([])
    await mountAsStudent()
    expect(shown()).toBe(true)
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    // An explanation, so a note (AppNote), as every other is: not a box drawn on its own.
    expect(rules().classList).toContain('app-note')
    expect(rules().getAttribute('aria-label')).toBe('Rules')
    for (const w of mounted.splice(0)) w.unmount()

    await mountAsStudent()
    expect(shown()).toBe(false)
    // What the toggle controls is still there, hidden.
    expect(toggle().getAttribute('aria-controls')).toBe('approvals-rules')
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  /** Each rule, as read, with the tab it names in bold. */
  const said = () =>
    [...rules().querySelectorAll('li')].map((li) => ({
      text: li.textContent!.trim(),
      tab: li.querySelector('strong')?.textContent ?? null,
    }))

  it('name the tab each is about, for someone who decides', async () => {
    answer([], [])
    await mountAs('instructor')
    expect(said()).toEqual([
      {
        text: 'Awaiting approval: nothing listed there has happened yet. Approving carries it out now, as whoever proposed it, once the system has checked their permissions again.',
        tab: 'Awaiting approval',
      },
      {
        text: 'Awaiting review: everything listed there has already happened. Reviewing records that someone has looked; it undoes nothing. Escalating asks a second person to look.',
        tab: 'Awaiting review',
      },
      {
        text: 'Nobody decides or reviews their own action — from any seat they have held, and not at one remove either.',
        tab: null,
      },
      { text: 'Both lists show the oldest first.', tab: null },
    ])
    // Their own actions are not this page's to point to.
    expect(rules().querySelector('a')).toBeNull()
  })

  it('name the tab each is about, for an agent’s owner, and say where her own actions are', async () => {
    answer([])
    await mountAsStudent()
    const [proposedRule, reviewRule, ownerRule, order] = said()
    expect(proposedRule).toEqual({
      text: 'Awaiting approval: nothing listed there has happened yet. Approving carries it out now, as your agent, once the system has checked its permissions again; withdrawing cancels it.',
      tab: 'Awaiting approval',
    })
    expect(reviewRule).toEqual({
      text: 'Awaiting review: your agent has already done everything listed there. Reviewing records that you have looked; it undoes nothing. Escalating asks someone else in the course to look.',
      tab: 'Awaiting review',
    })
    expect(ownerRule!.text).toBe(
      'You decide what your agent did only where you could have done it yourself without anyone’s confirmation.',
    )
    expect(order!.text).toBe('Both lists show the oldest first.')
    const more = rules().querySelector('.approvals__rules-more')!
    expect(more.textContent!.trim()).toBe('What you did yourself in this course is under My actions.')
    expect(more.querySelector('a')!.getAttribute('href')).toBe(`/courses/${COURSE}/my-actions`)
  })

  it('name the tabs in the reader’s language', async () => {
    setLocale('zh-Hant')
    answer([])
    await mountAsStudent()
    const [proposedRule, reviewRule] = said()
    expect(proposedRule!.tab).toBe('待批准')
    expect(proposedRule!.text).toMatch(/^待批准：其中的項目都尚未發生。/)
    expect(reviewRule!.tab).toBe('待覆核')
    expect(reviewRule!.text).toMatch(/^待覆核：其中都是你的代理已經做了的事。/)
    expect(rules().querySelector('.approvals__rules-more')!.textContent!.trim()).toBe(
      '你自己在本課程做過的事，可在「我的操作」查看。',
    )
  })

  it('stay as the person left them', async () => {
    localStorage.setItem('aishie.approvalsRules', 'closed')
    answer([])
    await mountAsStudent()
    expect(shown()).toBe(false)
    toggle().click()
    await flushPromises()
    expect(shown()).toBe(true)
    expect(localStorage.getItem('aishie.approvalsRules')).toBe('open')
    for (const w of mounted.splice(0)) w.unmount()

    await mountAsStudent()
    expect(shown()).toBe(true)
    toggle().click()
    await flushPromises()
    expect(shown()).toBe(false)
    expect(localStorage.getItem('aishie.approvalsRules')).toBe('closed')
  })

  it('start closed where the browser keeps nothing, and still open and close', async () => {
    const refuse = () => {
      throw new DOMException('denied', 'SecurityError')
    }
    vi.stubGlobal('localStorage', { getItem: refuse, setItem: refuse, removeItem: refuse, clear: refuse })
    answer([])
    await mountAsStudent()
    expect(shown()).toBe(false)
    toggle().click()
    await flushPromises()
    expect(shown()).toBe(true)
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
  })
})

describe('ApprovalsView, a seat whose decisions themselves need approval', () => {
  it.each([
    ['en', 'each time you approve, send back for changes or reject, your decision becomes a proposal itself'],
    ['zh-Hant', '你每次批准、要求修改或駁回，本身都會成為一項提案'],
    ['zh-Hans', '你每次批准、要求修改或拒绝，本身都会成为一项提议'],
  ] as const)('names each of the three decisions in its tag’s help (%s)', async (locale, words) => {
    setLocale(locale)
    answer([], [])
    const w = await mountAs('instructor')
    useCourseStore().perms = { ...useCourseStore().perms, action_decide: 'confirm_required' } as never
    await flushPromises()
    // The tag in the header, and the help on it.
    const tag = w
      .findAllComponents({ name: 'ElTooltip' })
      .find((x) => x.text().includes(i18n.global.t('actions.approvals.decisionsNeedApproval')))
    expect(tag).toBeDefined()
    expect(tag!.props('content')).toContain(words)
  })
})
