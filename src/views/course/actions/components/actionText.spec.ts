import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { MemberSummary, Membership } from '@/api/types'

// What Core answers, per tool; anything else is refused.
const answers = new Map<string, () => Promise<unknown>>()
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string) => {
      const a = answers.get(tool)
      return a ? a() : Promise.reject(new Error('no reads here'))
    }),
  }
})

import { flushPromises } from '@vue/test-utils'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import {
  decisionTag,
  excerpt,
  reasonText,
  routeFor,
  storedDecision,
  storedError,
  typeLabel,
  useJudgeRules,
  type ActionRow,
} from './actionText'
import { forgetMyAgents } from './myAgents'
import { setLocale } from '@/i18n'

const COURSE = 'c1'

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

function action(memberId: string, actorId = `actor-${memberId}`): ActionRow {
  return {
    id: 'act',
    actor_id: actorId,
    member_id: memberId,
    action_type: 'conversation.answer',
    target_type: 'conversation',
    authz_result: 'confirm_required',
    status: 'proposed',
    review_state: 'none',
    created_at: '2026-09-01T00:00:00Z',
    payload: {},
  } as ActionRow
}

/** The caller is seated as `me`; the course's members are `members`. */
function setup(me: MemberSummary, members: MemberSummary[], principal?: string) {
  forgetMyAgents()
  setActivePinia(createPinia())
  const session = useSessionStore()
  session.$patch({ me: { id: me.actor_id, kind: me.kind } } as never)
  const course = useCourseStore()
  course.$patch({
    courseId: COURSE,
    course: { id: COURSE, status: 'active' } as never,
    membership: { member_id: me.id, principal_member_id: principal ?? null } as unknown as Membership,
    membersState: 'loaded',
  } as never)
  course.members = new Map([me, ...members].map((m) => [m.id, m]))
  return useJudgeRules()
}

describe('useJudgeRules: a person and their agents are one party', () => {
  const me = seat('me')
  let rules: ReturnType<typeof setup>

  beforeEach(() => {
    rules = setup(me, [])
  })

  it('leaves one’s own agent’s proposal to its owner where the queue says it is theirs, and says why where it is not', () => {
    const bot = seat('bot', { kind: 'agent', principal_member_id: 'me', owner_actor_id: 'actor-me' })
    rules = setup(me, [bot])
    expect(rules.isOwnParty(action('bot'))).toBe(true)
    expect(rules.isOwnAgent(action('bot'))).toBe(true)
    // Their own level for it is autonomous and it is within their reach: theirs to decide, as its owner.
    expect(rules.block({ ...action('bot'), yours_to_decide: true }, 'decide')).toBeNull()
    // It is not: someone else decides, because their own level is lower.
    expect(rules.block({ ...action('bot'), yours_to_decide: false }, 'decide')).toBe('ownAgentLevel')
    expect(rules.block({ ...action('bot'), yours_to_decide: false }, 'review')).toBe('ownAgentLevel')
    // Read with action.get, which does not say: Core decides, and says why if not.
    expect(rules.block(action('bot'), 'decide')).toBeNull()
  })

  it('blocks an agent deciding its owner’s proposal, and a sibling agent’s', () => {
    const agent = seat('agent', { kind: 'agent', principal_member_id: 'owner', owner_actor_id: 'actor-owner' })
    const owner = seat('owner')
    const sibling = seat('sib', { kind: 'agent', principal_member_id: 'owner', owner_actor_id: 'actor-owner' })
    rules = setup(agent, [owner, sibling], 'owner')
    expect(rules.block(action('owner'), 'decide')).toBe('ownAgent')
    expect(rules.block(action('sib'), 'review')).toBe('ownAgent')
  })

  it('leaves someone else’s agent to the caller', () => {
    const theirs = seat('theirs', { kind: 'agent', principal_member_id: 'other', owner_actor_id: 'actor-other' })
    rules = setup(me, [seat('other'), theirs])
    expect(rules.block(action('theirs'), 'decide')).toBeNull()
  })

  it('takes the queue’s word for whose it is to decide over the member list', () => {
    // Someone else's seat as far as the list shows, but Core says it is the caller's party's.
    rules = setup(me, [seat('stranger')])
    expect(rules.block({ ...action('stranger'), yours_to_decide: false }, 'decide')).toBe('ownAgent')
    // The list would say it is the caller's agent's; the queue says it is theirs to decide.
    const bot = seat('bot', { kind: 'agent', principal_member_id: 'me', owner_actor_id: 'actor-me' })
    rules = setup(me, [bot])
    expect(rules.block({ ...action('bot'), yours_to_decide: true }, 'decide')).toBeNull()
    // One's own is one's own whatever the flag.
    expect(rules.block({ ...action('me'), yours_to_decide: false }, 'review')).toBe('ownReview')
  })

  it('still calls the caller’s own action their own', () => {
    expect(rules.block(action('me'), 'decide')).toBe('own')
    expect(rules.block(action('me'), 'review')).toBe('ownReview')
  })
})

describe('useJudgeRules: an agent’s owner who decides nothing else', () => {
  const me = seat('me', { role: 'student' })

  function ownerOnly() {
    // A student: no member list to read, and no action_decide.
    const rules = setup(me, [])
    const course = useCourseStore()
    course.$patch({ perms: { action_decide: 'denied', document_read: 'autonomous' }, permsSource: 'exact' } as never)
    course.members = new Map()
    course.membersState = 'forbidden'
    return rules
  }

  it('takes what Core shows such a caller to decide for their own agent’s', () => {
    const rules = ownerOnly()
    expect(rules.isOwnAgent(action('bot', 'actor-bot'))).toBe(true)
    expect(rules.isOwnAgent(action('me'))).toBe(false)
    expect(rules.block({ ...action('bot', 'actor-bot'), yours_to_decide: false }, 'decide')).toBe('ownAgentLevel')
    expect(rules.block({ ...action('bot', 'actor-bot'), yours_to_decide: true }, 'decide')).toBeNull()
  })

  it('knows the caller’s own agents from their list of agents', async () => {
    answers.set('agent.list', async () => ({ agents: [{ actor_id: 'actor-bot', display_name: 'Mei’s helper' }] }))
    // A decider who reads the member list, where the agent's seat is not (yet) listed.
    const rules = setup(me, [seat('stranger')])
    expect(rules.isOwnAgent(action('bot', 'actor-bot'))).toBe(false)
    await flushPromises()
    expect(rules.isOwnAgent(action('bot', 'actor-bot'))).toBe(true)
    expect(rules.isOwnAgent(action('stranger'))).toBe(false)
    answers.delete('agent.list')
  })

  it('tells a decision by the agent’s owner from anyone else’s', () => {
    const bot = seat('bot', { kind: 'agent', principal_member_id: 'mei', owner_actor_id: 'actor-mei' })
    const rules = setup(seat('teacher'), [seat('mei', { role: 'student' }), bot])
    const decided = (by: string, over: Partial<ActionRow> = {}) =>
      ({ ...action('bot'), status: 'executed', decided_by_member_id: by, ...over }) as ActionRow
    expect(rules.byOwner(decided('mei'), 'decided')).toBe(true)
    expect(rules.byOwner(decided('teacher'), 'decided')).toBe(false)
    expect(rules.byOwner({ ...decided('mei'), reviewed_by_member_id: 'mei' }, 'reviewed')).toBe(true)
    // A rejection says so itself.
    const rejected = decided('x', { status: 'rejected', result: { decision: { decision: 'reject', by_owner: true } } })
    expect(rules.byOwner(rejected, 'decided')).toBe(true)
    // Without the member list, the caller's own agent's decided from their own seat.
    const own = ownerOnly()
    expect(own.byOwner({ ...decided('me'), member_id: 'bot', actor_id: 'actor-bot' }, 'decided')).toBe(true)
  })
})

describe('reasonText', () => {
  it('says a proposal taken back by its agent’s owner was', () => {
    const cancelled = {
      status: 'cancelled',
      result: {
        error: {
          code: 'failed_precondition',
          message: 'the proposal can no longer be carried out',
          details: { reason: 'withdrawn', by_owner: true },
        },
      },
    } as unknown as ActionRow
    expect(reasonText(storedError(cancelled))).toBe('The owner of the agent that proposed it took it back.')
    const own = { ...cancelled, result: { error: { code: 'x', message: 'y', details: { reason: 'withdrawn' } } } }
    expect(reasonText(storedError(own as ActionRow))).toBe('Whoever proposed it took it back.')
  })
  it('says an owner’s refused decision in the words the app says it in when met, not as Core’s bare reason', () => {
    // action.decide by an agent's owner, recorded as failed (AIShie-Core#60).
    const failed = (details: Record<string, unknown>) =>
      ({ status: 'failed', result: { error: { code: 'forbidden', message: 'core’s own words', details } } }) as unknown as ActionRow
    expect(
      reasonText(
        storedError(
          failed({
            reason: 'owner_would_be_refused',
            refusal: { code: 'conflict', message: 'the document is published already' },
          }),
        ),
      ),
    ).toBe(
      'This proposal of your agent’s is not yours to decide now: approved now, it would be refused. You may withdraw it, or someone else in the course rejects it. Why it would be refused: This conflicts with the current state: the document is published already',
    )
    expect(reasonText(storedError(failed({ reason: 'owner_not_autonomous' })))).toMatch(
      /^You decide what your agent did only where you could have done it yourself without anyone’s confirmation\./,
    )
    expect(reasonText(storedError(failed({ reason: 'some_new_reason' })))).toBe('some_new_reason')
  })
})

describe('storedDecision', () => {
  const decided = (status: string, decision: Record<string, unknown>) =>
    ({ status, result: { decision: { by_action_id: 'd1', ...decision } } }) as unknown as ActionRow

  it('reads a request for changes’ note where a rejection’s reason is', () => {
    expect(
      storedDecision(decided('changes_requested', { decision: 'request_changes', reason: 'Cite the rubric.' })),
    ).toEqual({
      reason: 'Cite the rubric.',
      byActionId: 'd1',
      byOwner: false,
    })
    expect(storedDecision(decided('rejected', { decision: 'reject', reason: 'No.', by_owner: true }))).toEqual({
      reason: 'No.',
      byActionId: 'd1',
      byOwner: true,
    })
  })

  it('reads nothing from an action that was not decided against', () => {
    expect(storedDecision(decided('executed', { decision: 'approve' }))).toBeNull()
    expect(storedDecision(decided('proposed', {}))).toBeNull()
  })

  it('tells a byOwner request for changes, as a rejection, from what it recorded', () => {
    const rules = setup(seat('teacher'), [])
    const sent = {
      ...action('bot', 'actor-bot'),
      status: 'changes_requested',
      decided_by_member_id: 'x',
      result: { decision: { decision: 'request_changes', reason: 'Shorter.', by_owner: true } },
    } as ActionRow
    expect(rules.byOwner(sent, 'decided')).toBe(true)
  })
})

describe('decisionTag', () => {
  it('words and colours each decision, a request for changes between approving and rejecting', () => {
    expect(decisionTag('approve')).toEqual({ type: 'success', label: 'Approve' })
    expect(decisionTag('request_changes')).toEqual({ type: 'warning', label: 'Request changes' })
    expect(decisionTag('reject')).toEqual({ type: 'danger', label: 'Reject' })
    expect(decisionTag('something_new')).toEqual({ type: 'danger', label: 'something_new' })
  })
})

describe('routeFor', () => {
  it('leads a conversation to its old page’s address, which opens it in the chat panel', () => {
    expect(routeFor(COURSE, 'conversation', 'cv1')).toEqual({
      name: 'course-conversations',
      params: { courseId: COURSE, conversationId: 'cv1' },
    })
    expect(routeFor(COURSE, 'conversation_id', null)).toBeNull()
  })
})

describe('excerpt', () => {
  it('gives the start of a message as one plain line', () => {
    expect(excerpt('What is **recursion**?\n\n- a\n- b')).toBe('What is recursion? - a - b')
    expect(excerpt('See [the notes](https://x.test/n) `code`')).toBe('See the notes code')
    expect(excerpt('x'.repeat(100), 10)).toBe(`${'x'.repeat(9)}…`)
    expect(excerpt('   ')).toBeUndefined()
    expect(excerpt(42)).toBeUndefined()
  })
})

describe('typeLabel', () => {
  it('says in words that a conversation was marked read, which a student does each time she reads an answer', () => {
    setLocale('en')
    expect(typeLabel('conversation.mark_read')).toBe('Mark a conversation read')
    setLocale('zh-Hant')
    expect(typeLabel('conversation.mark_read')).toBe('標示對話為已讀')
    setLocale('zh-Hans')
    expect(typeLabel('conversation.mark_read')).toBe('将对话标记为已读')
    setLocale('en')
  })
})
