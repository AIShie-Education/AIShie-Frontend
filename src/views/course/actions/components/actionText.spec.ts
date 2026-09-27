import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { MemberSummary, Membership } from '@/api/types'

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return { ...real, read: vi.fn(async () => Promise.reject(new Error('no reads here'))) }
})

import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import { excerpt, routeFor, useJudgeRules, type ActionRow } from './actionText'

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

  it('blocks deciding one’s own agent’s proposal', () => {
    const bot = seat('bot', { kind: 'agent', principal_member_id: 'me', owner_actor_id: 'actor-me' })
    rules = setup(me, [bot])
    expect(rules.block(action('bot'), 'decide')).toBe('ownAgent')
    expect(rules.isOwnParty(action('bot'))).toBe(true)
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

describe('routeFor', () => {
  it('leads a conversation to the conversations page', () => {
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
