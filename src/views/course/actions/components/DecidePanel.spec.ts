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
function mountAsTeacher(action: ActionRow = PROPOSAL) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().$patch({ me: { id: 'actor-teacher', kind: 'human', display_name: 'Teacher' } } as never)
  const course = useCourseStore()
  course.$patch({
    courseId: COURSE,
    course: { id: COURSE, code: 'CS101', section: 'A', title: 'Programming', status: 'active' } as never,
    membership: { member_id: 'teacher', role: 'instructor' } as never,
    perms: { action_decide: 'autonomous', member_read: 'autonomous' },
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
    props: { action, courseId: COURSE, mode: 'decide' },
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
const confirmButton = () =>
  [...document.body.querySelectorAll<HTMLButtonElement>('.decide-panel__confirm button')].find(
    (b) => b.textContent?.trim() === 'Send back for changes',
  )

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
    expect(confirmButton()!.disabled).toBe(true)
    // Spaces alone are no note.
    await type('   \n ')
    expect(confirmButton()!.disabled).toBe(true)
    confirmButton()!.click()
    await flushPromises()
    expect(write).not.toHaveBeenCalled()
  })

  it('is not offered on an agent’s answer, which the runtime of today would leave waiting for good', async () => {
    mountAsTeacher(ANSWER)
    await flushPromises()
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Approve', 'Reject'])
    // Rejecting it, with a reason the agent answers again with, is as before.
    button('Reject')!.click()
    await flushPromises()
    expect(document.body.querySelector('.decide-panel__form textarea')!.getAttribute('placeholder')).toBe(
      'Why? (optional, but it helps whoever proposed it)',
    )
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
    expect(confirmButton()!.disabled).toBe(false)
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
    ['zh-Hant', '要求修改', '退回修改'],
    ['zh-Hans', '要求修改', '退回修改'],
  ] as const)('is worded in %s', async (locale, offer, confirm) => {
    setLocale(locale)
    mountAsTeacher()
    await flushPromises()
    const b = buttons().find((x) => x.textContent?.trim() === offer)!
    b.click()
    await flushPromises()
    expect(document.body.querySelector('.decide-panel__confirm')!.textContent).toContain(confirm)
  })
})
