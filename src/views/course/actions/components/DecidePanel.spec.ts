import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as Icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import type { MemberSummary } from '@/api/types'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import DecidePanel from './DecidePanel.vue'
import { forgetMyAgents } from './myAgents'
import type { ActionRow } from './actionText'

const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'
const read = vi.fn()
const write = vi.fn()
vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  read: (...a: unknown[]) => read(...a),
  write: (...a: unknown[]) => write(...a),
}))

function seat(id: string, over: Partial<MemberSummary> = {}): MemberSummary {
  return {
    id,
    actor_id: `actor-${id}`,
    display_name: id,
    kind: 'human',
    role: 'instructor',
    status: 'active',
    student_scope: 'all',
    assignment_scope: 'all',
    created_at: '2026-09-01T00:00:00Z',
    perms: {},
    ...over,
  } as MemberSummary
}

/** A grade the course's grading agent proposed, waiting for the teacher. */
const PROPOSAL = {
  id: 'p1',
  actor_id: 'actor-grader',
  member_id: 'grader',
  action_type: 'grade.submit',
  target_type: 'submission',
  target_id: 's1',
  payload: { submission_id: 's1', score: '6', feedback: 'Thin testing.' },
  authz_result: 'confirm_required',
  status: 'proposed',
  review_state: 'none',
  created_at: '2026-09-28T10:00:00Z',
  yours_to_decide: true,
} as ActionRow

/** A course agent's answer to a student's question, waiting for the teacher. */
const ANSWER = {
  id: 'p2',
  actor_id: 'actor-tutor',
  member_id: 'tutor',
  action_type: 'conversation.answer',
  target_type: 'conversation',
  target_id: 'c1',
  payload: { conversation_id: 'c1', in_reply_to_message_id: 'm1', body: 'Multiply by 9/5, then add 32.' },
  authz_result: 'confirm_required',
  status: 'proposed',
  review_state: 'none',
  created_at: '2026-09-28T10:05:00Z',
  yours_to_decide: true,
} as ActionRow

const mounted: { unmount: () => void }[] = []
beforeEach(() => {
  forgetMyAgents()
  read.mockReset()
  read.mockImplementation(async (tool: string) => {
    if (tool === 'agent.list') return { agents: [] }
    throw new ApiError({ status: 403, code: 'forbidden', message: 'permission denied' })
  })
  write.mockReset()
})
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  setLocale('en')
  document.body.innerHTML = ''
})

/** The teacher, who decides here at once, with the grading agent and the tutor (someone else's) seated. */
function mountAsTeacher(
  action: ActionRow = PROPOSAL,
  opts: { archived?: boolean; waiting?: string; perms?: Record<string, string>; mode?: 'decide' | 'review' } = {},
) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().$patch({ me: { id: 'actor-teacher', kind: 'human', display_name: 'Teacher' } } as never)
  const course = useCourseStore()
  course.$patch({
    courseId: COURSE,
    course: {
      id: COURSE,
      code: 'CS101',
      section: 'A',
      title: 'Programming',
      status: opts.archived ? 'archived' : 'active',
    } as never,
    membership: { member_id: 'teacher', role: 'instructor' } as never,
    perms: { action_decide: 'autonomous', member_read: 'autonomous', ...opts.perms },
    permsSource: 'exact',
    membersState: 'loaded',
  } as never)
  const seats = [
    seat('teacher'),
    seat('grader', { kind: 'agent', role: 'grader', owner_actor_id: 'actor-admin' }),
    seat('tutor', { kind: 'agent', role: 'tutor', owner_actor_id: 'actor-admin', hosting: 'runtime' }),
  ]
  course.members = new Map(seats.map((m) => [m.id, m]))
  const w = mount(DecidePanel, {
    props: { action, courseId: COURSE, mode: opts.mode ?? 'decide', waiting: opts.waiting },
    attachTo: document.body,
    global: {
      plugins: [
        pinia,
        i18n,
        ElementPlus,
        { install: (app) => Object.entries(Icons).forEach(([n, c]) => app.component(n, c)) },
      ],
    },
  })
  mounted.push(w)
  return w
}

const buttons = () => [...document.body.querySelectorAll<HTMLButtonElement>('.decide-panel button')]
const button = (name: string) => buttons().find((b) => b.textContent?.trim() === name)
const confirmButton = (name = 'Send back for changes') =>
  [...document.body.querySelectorAll<HTMLButtonElement>('.decide-panel__confirm button')].find(
    (b) => b.textContent?.trim() === name,
  )
const field = () => document.body.querySelector<HTMLTextAreaElement>('.decide-panel__form textarea')!
/** What an element's aria-describedby points at, in words. */
const description = (el: Element) =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? `(no #${id})`)
/** Off, as a screen reader and Playwright's toBeDisabled take it, while Tab still reaches it. */
const off = (b: HTMLButtonElement) => b.getAttribute('aria-disabled') === 'true' && !b.disabled

async function type(text: string) {
  const area = document.body.querySelector<HTMLTextAreaElement>('.decide-panel__form textarea')!
  area.value = text
  area.dispatchEvent(new Event('input'))
  await flushPromises()
}

describe('DecidePanel, asking for changes', () => {
  it('offers Request changes between Approve and Reject, and sends nothing without a note', async () => {
    mountAsTeacher()
    await flushPromises()
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Approve', 'Request changes', 'Reject'])
    button('Request changes')!.click()
    await flushPromises()
    const form = document.body.querySelector('.decide-panel__form')!
    expect(form.textContent).toContain('The proposer is told what to change, and may propose it again')
    expect(form.querySelector('textarea')!.placeholder).toBe(
      'What should change? (required: the proposer reads it)',
    )
    expect(form.textContent).toContain('a request for changes needs a note')
    // The count of what is written, out of 2000.
    expect(form.querySelector('.el-input__count')!.textContent).toContain('2000')
    expect(off(confirmButton()!)).toBe(true)
    // Spaces alone are no note.
    await type('   \n ')
    expect(off(confirmButton()!)).toBe(true)
    confirmButton()!.click()
    await flushPromises()
    expect(write).not.toHaveBeenCalled()
  })

  it('puts the focus in the field, named for what it asks, required, and described by what it needs', async () => {
    mountAsTeacher()
    await flushPromises()
    button('Request changes')!.click()
    await flushPromises()
    expect(document.activeElement).toBe(field())
    expect(field().getAttribute('aria-label')).toBe('What to change')
    expect(field().getAttribute('aria-required')).toBe('true')
    expect(description(field())).toEqual([
      'Nothing is carried out. The proposer is told what to change, and may propose it again.',
      'Say what should change: a request for changes needs a note, of up to 2000 characters.',
    ])
    // Once there is a note, the field says no more that one is needed.
    await type('Test the empty list.')
    expect(description(field())).toEqual([
      'Nothing is carried out. The proposer is told what to change, and may propose it again.',
    ])
  })

  it('says why its confirm button is off, which Tab reaches right after the field, and which sends nothing', async () => {
    mountAsTeacher()
    await flushPromises()
    button('Request changes')!.click()
    await flushPromises()
    const send = confirmButton()!
    expect(off(send)).toBe(true)
    expect(send.classList).toContain('is-disabled')
    expect(description(send)).toEqual([
      'Say what should change: a request for changes needs a note, of up to 2000 characters.',
    ])
    // Tab goes from the field to the confirm button, then to Cancel.
    const focusable = [
      ...document.body.querySelectorAll<HTMLElement>('.decide-panel__form textarea, .decide-panel__form button'),
    ]
    expect(focusable.map((e) => e.textContent?.trim() || e.tagName)).toEqual([
      'TEXTAREA',
      'Send back for changes',
      'Cancel',
    ])
    // Pressed all the same: nothing is sent, and the focus goes back to the field.
    send.focus()
    send.click()
    await flushPromises()
    expect(write).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(field())
    await type('Test the empty list.')
    expect(send.getAttribute('aria-disabled')).toBeNull()
    expect(send.getAttribute('aria-describedby')).toBeNull()
    expect(send.classList).not.toContain('is-disabled')
  })

  it('puts the focus in the field when Reject opens it too, which needs no note', async () => {
    mountAsTeacher()
    await flushPromises()
    button('Reject')!.click()
    await flushPromises()
    expect(document.activeElement).toBe(field())
    expect(field().getAttribute('aria-label')).toBe('Reason for rejecting')
    expect(field().getAttribute('aria-required')).toBeNull()
    expect(description(field())).toEqual(['Nothing is carried out. The proposer is told.'])
    expect(off(confirmButton('Reject')!)).toBe(false)
    expect(confirmButton('Reject')!.disabled).toBe(false)
  })

  it('leaves the focus on Approve, whose reason is seldom written, with its field named all the same', async () => {
    mountAsTeacher()
    await flushPromises()
    button('Approve')!.focus()
    button('Approve')!.click()
    await flushPromises()
    expect(document.activeElement).toBe(button('Approve'))
    expect(field().getAttribute('aria-label')).toBe('Reason for approving')
  })

  it.each([
    ['their own proposal', { ...PROPOSAL, member_id: 'teacher', actor_id: 'actor-teacher' }, {}],
    ['someone else’s party’s, as the queue says', { ...PROPOSAL, yours_to_decide: false }, {}],
    ['in an archived course', PROPOSAL, { archived: true }],
    ['while their decision on it waits for approval', PROPOSAL, { waiting: 'd9' }],
  ] as const)('is off whenever Reject is: %s', async (_, action, opts) => {
    mountAsTeacher(action as ActionRow, opts)
    await flushPromises()
    expect(button('Reject')!.disabled).toBe(true)
    expect(button('Request changes')!.disabled).toBe(true)
  })

  it('is off whenever Reject is: while a decision is being sent', async () => {
    mountAsTeacher()
    await flushPromises()
    button('Reject')!.click()
    await flushPromises()
    write.mockReturnValueOnce(new Promise(() => undefined))
    confirmButton('Reject')!.click()
    await flushPromises()
    expect(button('Reject')!.disabled).toBe(true)
    expect(button('Request changes')!.disabled).toBe(true)
  })

  it.each([
    ['en', 'You can still send it back for changes or reject it.'],
    ['zh-Hant', '你仍可要求修改或駁回。'],
    ['zh-Hans', '你仍可要求修改或拒绝。'],
  ] as const)(
    'stays on, with Reject, where approving would close the caller’s own escalation, and is named there (%s)',
    async (locale, words) => {
      setLocale(locale)
      // Someone's proposal to close, by review, the escalation the teacher raised.
      read.mockImplementation(async (tool: string, args: { action_id?: string }) => {
        if (tool === 'agent.list') return { agents: [] }
        if (tool === 'action.get' && args.action_id === 'x1')
          return {
            ...PROPOSAL,
            id: 'x1',
            status: 'executed',
            review_state: 'escalated',
            reviewed_by_member_id: 'teacher',
          }
        throw new ApiError({ status: 403, code: 'forbidden', message: 'permission denied' })
      })
      mountAsTeacher({
        ...PROPOSAL,
        id: 'r1',
        actor_id: 'actor-grader',
        member_id: 'grader',
        action_type: 'action.review',
        target_type: 'action',
        target_id: 'x1',
        payload: { action_id: 'x1', outcome: 'reviewed' },
      } as ActionRow)
      await flushPromises()
      const [approve, changes, reject] = buttons()
      expect(approve!.disabled).toBe(true)
      expect(changes!.disabled).toBe(false)
      expect(reject!.disabled).toBe(false)
      expect(document.body.querySelector('.decide-panel__blocked')!.textContent).toContain(words)
    },
  )

  it('ranks Request changes as Reject: outlined, pressed in while its form is open, whose confirm is the one primary', async () => {
    mountAsTeacher()
    await flushPromises()
    const hue = (b: HTMLButtonElement | undefined) =>
      [...b!.classList].filter((c) => /^el-button--(primary|success|warning|danger|info)$/.test(c))
    expect(hue(button('Approve'))).toEqual(['el-button--primary'])
    expect(hue(button('Request changes'))).toEqual([])
    expect(hue(button('Reject'))).toEqual([])
    button('Request changes')!.click()
    await flushPromises()
    expect(button('Request changes')!.classList).toContain('is-chosen')
    expect(button('Request changes')!.getAttribute('aria-pressed')).toBe('true')
    expect(button('Reject')!.getAttribute('aria-pressed')).toBe('false')
    expect(hue(button('Approve'))).toEqual([])
    expect(hue(button('Request changes'))).toEqual([])
    await type('Test the empty list.')
    expect(hue(confirmButton())).toEqual(['el-button--primary'])
    expect(off(confirmButton()!)).toBe(false)
  })

  it('is offered on an agent’s answer in a conversation, as on any proposal, and sends it back with the note', async () => {
    mountAsTeacher(ANSWER)
    await flushPromises()
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Approve', 'Request changes', 'Reject'])
    button('Request changes')!.click()
    await flushPromises()
    await type('Show the working: 0 × 9/5 + 32.')
    write.mockResolvedValueOnce({
      status: 'executed',
      actionId: 'd2',
      reviewState: 'none',
      replayed: false,
      result: { action_id: 'p2', outcome: 'changes_requested' },
    })
    confirmButton()!.click()
    await flushPromises()
    expect(write).toHaveBeenCalledWith(
      'action.decide',
      { course_id: COURSE, action_id: 'p2', decision: 'request_changes', reason: 'Show the working: 0 × 9/5 + 32.' },
      expect.anything(),
    )
    expect(document.body.textContent).toContain('Sent back for changes')
  })

  it('sends the note, trimmed, as the reason of a request_changes decision, and says what became of it', async () => {
    const w = mountAsTeacher()
    await flushPromises()
    button('Request changes')!.click()
    await flushPromises()
    await type('  Say which test fails, and why.  ')
    expect(document.body.querySelector('.decide-panel__form')!.textContent).not.toContain(
      'a request for changes needs a note',
    )
    expect(off(confirmButton()!)).toBe(false)
    write.mockResolvedValueOnce({
      status: 'executed',
      actionId: 'd1',
      reviewState: 'none',
      replayed: false,
      result: { action_id: 'p1', outcome: 'changes_requested' },
    })
    confirmButton()!.click()
    await flushPromises()
    expect(write).toHaveBeenCalledWith(
      'action.decide',
      { course_id: COURSE, action_id: 'p1', decision: 'request_changes', reason: 'Say which test fails, and why.' },
      expect.anything(),
    )
    expect(document.body.textContent).toContain('Sent back for changes')
    expect(w.emitted('done')).toEqual([
      [{ kind: 'decided', decision: 'request_changes', out: { action_id: 'p1', outcome: 'changes_requested' } }],
    ])
  })

  it('says Core’s refusal of the note in the app’s words', async () => {
    mountAsTeacher()
    await flushPromises()
    button('Request changes')!.click()
    await flushPromises()
    await type('Shorter, please.')
    write.mockRejectedValueOnce(
      new ApiError({
        status: 400,
        code: 'invalid_argument',
        message: 'the note is 2001 characters long; the most is 2000',
        details: { reason: 'note_too_long' },
      }),
    )
    confirmButton()!.click()
    await flushPromises()
    expect(document.body.textContent).toContain(
      'The note is too long: a request for changes says what to change in at most 2000 characters.',
    )
    // The form stays, with what was written.
    expect(document.body.querySelector<HTMLTextAreaElement>('.decide-panel__form textarea')!.value).toBe(
      'Shorter, please.',
    )
  })

  it.each([
    ['zh-Hant', '要求修改', '退回修改', '需要修改的地方'],
    ['zh-Hans', '要求修改', '退回修改', '需要修改的地方'],
  ] as const)('is worded in %s', async (locale, offer, confirm, label) => {
    setLocale(locale)
    mountAsTeacher()
    await flushPromises()
    const b = buttons().find((x) => x.textContent?.trim() === offer)!
    b.click()
    await flushPromises()
    expect(document.body.querySelector('.decide-panel__confirm')!.textContent).toContain(confirm)
    expect(field().getAttribute('aria-label')).toBe(label)
  })
})

/** A teaching assistant's deletion of a quiz for good, waiting: what its proposer was shown, and confirmed. */
const NONE = { submissions: 0, handed_in: 0, drafts: 0, missing: 0, grades: 0, posted: 0, files: 0, proposals: 0, totals: 0 }
const DELETION = {
  id: 'p3',
  actor_id: 'actor-ta',
  member_id: 'ta',
  action_type: 'assignment.delete',
  target_type: 'assignment',
  target_id: 'asg-1',
  payload: {
    course_id: COURSE,
    assignment_id: 'asg-1',
    confirm: { ...NONE, submissions: 1, drafts: 1, totals: 12 },
  },
  authz_result: 'confirm_required',
  status: 'proposed',
  review_state: 'none',
  created_at: '2026-10-04T10:00:00Z',
  yours_to_decide: true,
} as unknown as ActionRow
const stake = () => document.body.querySelector<HTMLElement>('.deletion-stake')
const stakeLines = () => [...(stake()?.querySelectorAll('li') ?? [])].map((li) => li.textContent?.trim())

describe('DecidePanel, a deletion of an assignment for good', () => {
  it('says, where Approve is pressed, that approving deletes it for good, with what goes with it', async () => {
    mountAsTeacher(DELETION)
    await flushPromises()
    expect(stake()!.textContent).toContain(
      'Approving deletes this assignment for good, with what goes with it. This cannot be undone.',
    )
    // Without writing assignments, what would go now is not read: what the proposer was shown is listed.
    expect(read).not.toHaveBeenCalledWith('assignment.delete_preview', expect.anything())
    expect(stakeLines()).toEqual([
      'Submissions: 1 (1 draft)',
      'Totals worked out again: 12 students’ posted totals, with the change recorded',
    ])
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Approve', 'Request changes', 'Reject'])
  })

  it('confirms approving it in solid red, as the last step of what cannot be taken back', async () => {
    mountAsTeacher(DELETION)
    await flushPromises()
    button('Approve')!.click()
    await flushPromises()
    const confirm = confirmButton('Approve and delete for good')!
    expect(confirm).toBeTruthy()
    expect(confirm.classList).toContain('el-button--danger')
    expect(confirm.classList).not.toContain('el-button--primary')
    write.mockResolvedValueOnce({
      status: 'executed',
      actionId: 'd3',
      reviewState: 'none',
      replayed: false,
      result: { action_id: 'p3', outcome: 'executed' },
    })
    confirm.click()
    await flushPromises()
    expect(write).toHaveBeenCalledWith(
      'action.decide',
      { course_id: COURSE, action_id: 'p3', decision: 'approve', reason: undefined },
      expect.anything(),
    )
  })

  it('confirms approving it as any approval where the decision itself waits for approval', async () => {
    mountAsTeacher(DELETION, { perms: { action_decide: 'confirm_required' } })
    await flushPromises()
    button('Approve')!.click()
    await flushPromises()
    expect(confirmButton('Approve and delete for good')).toBeUndefined()
    expect(confirmButton('Approve now')!.classList).toContain('el-button--primary')
  })

  it('lists what would go now, for whoever writes assignments, and says approving would fail where more would go', async () => {
    read.mockImplementation(async (tool: string) => {
      if (tool === 'agent.list') return { agents: [] }
      if (tool === 'assignment.delete_preview')
        return {
          assignment_id: 'asg-1',
          title: 'Quiz 3',
          published: true,
          in_grade: true,
          counts: { ...NONE, submissions: 1, drafts: 1, totals: 12 },
          refusal: null,
        }
      throw new ApiError({ status: 403, code: 'forbidden', message: 'permission denied' })
    })
    mountAsTeacher(DELETION, { perms: { assignment_write: 'autonomous' } })
    await flushPromises()
    expect(read).toHaveBeenCalledWith('assignment.delete_preview', { course_id: COURSE, assignment_id: 'asg-1' })
    expect(stake()!.textContent).not.toContain('Approving will fail')

    // More now than the proposer was shown: a grade given since.
    read.mockImplementation(async (tool: string) => {
      if (tool === 'agent.list') return { agents: [] }
      if (tool === 'assignment.delete_preview')
        return {
          assignment_id: 'asg-1',
          title: 'Quiz 3',
          published: true,
          in_grade: true,
          counts: { ...NONE, submissions: 1, handed_in: 1, grades: 1, totals: 12 },
          refusal: null,
        }
      throw new ApiError({ status: 403, code: 'forbidden', message: 'permission denied' })
    })
    for (const w of mounted.splice(0)) w.unmount()
    mountAsTeacher(DELETION, { perms: { assignment_write: 'autonomous' } })
    await flushPromises()
    expect(stake()!.textContent).toContain('Approving will fail: more has been added since this was proposed.')
    // What it was proposed with, which is all approving it could take.
    expect(stakeLines()).toEqual([
      'Submissions: 1 (1 draft)',
      'Totals worked out again: 12 students’ posted totals, with the change recorded',
    ])
  })

  it('says it was deleted already, where it was', async () => {
    read.mockImplementation(async (tool: string) => {
      if (tool === 'agent.list') return { agents: [] }
      throw new ApiError({ status: 404, code: 'not_found', message: 'deleted', details: { reason: 'deleted' } })
    })
    mountAsTeacher(DELETION, { perms: { assignment_write: 'autonomous' } })
    await flushPromises()
    expect(stake()!.textContent).toContain('The assignment has been deleted already.')
    expect(stake()!.textContent).not.toContain('Approving deletes')
  })

  it('is not said of any other proposal, nor of a deletion in the review queue', async () => {
    mountAsTeacher()
    await flushPromises()
    expect(stake()).toBeNull()
    for (const w of mounted.splice(0)) w.unmount()
    mountAsTeacher({ ...DELETION, status: 'executed', review_state: 'pending' } as ActionRow, { mode: 'review' })
    await flushPromises()
    expect(stake()).toBeNull()
  })

  it.each([
    ['zh-Hant', '批准會永久刪除此作業及一併刪除的內容，無法復原。', '批准並永久刪除'],
    ['zh-Hans', '批准会永久删除此作业及一并删除的内容，无法恢复。', '批准并永久删除'],
  ] as const)('is worded in %s', async (locale, lead, confirm) => {
    setLocale(locale)
    mountAsTeacher(DELETION)
    await flushPromises()
    expect(stake()!.textContent).toContain(lead)
    buttons()[0]!.click()
    await flushPromises()
    expect(confirmButton(confirm)).toBeTruthy()
  })
})
