import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '@/api/http'
import type { AgentCredential, Membership } from '@/api/types'
import {
  agentStanding,
  assignmentReach,
  countedAgents,
  courseChoices,
  grantedPerms,
  knownAgentLimit,
  agentSelfService,
  createBlock,
  noteAgentList,
  limitFromError,
  noteAgentLimit,
  runtimeAgentFile,
  runtimeAgentId,
  setupProgress,
  studentReach,
  toPermLevels,
} from './agents'

function seat(over: Partial<Membership> = {}): Membership {
  return {
    member_id: 'm-' + (over.course_id ?? 'c1'),
    course_id: 'c1',
    code: 'CS101',
    section: 'A',
    title: 'Programming',
    course_status: 'active',
    role: 'student',
    status: 'active',
    student_scope: 'listed',
    assignment_scope: 'all',
    perms: { agent_delegate: 'confirm_required', member_manage: 'denied' },
    answers_course: false,
    perm_ceilings: {},
    ...over,
  }
}

describe('agentStanding and countedAgents', () => {
  it('tells an owner’s own suspension from an administrator’s', () => {
    expect(agentStanding({ status: 'active', suspended_by_me: false })).toBe('active')
    expect(agentStanding({ status: 'suspended', suspended_by_me: true })).toBe('suspendedByMe')
    expect(agentStanding({ status: 'suspended', suspended_by_me: false })).toBe('suspendedByAdmin')
  })
  it('counts only agents that are not suspended against the limit', () => {
    expect(countedAgents([{ status: 'active' }, { status: 'suspended' }, { status: 'active' }])).toBe(2)
    expect(countedAgents(null)).toBe(0)
  })
})

describe('the agent limit', () => {
  beforeEach(() => {
    knownAgentLimit.value = null
    agentSelfService.value = null
  })
  it('is read from agent.list, with whether one may register agents oneself', () => {
    expect(createBlock(9)).toBeNull()
    noteAgentList({ limit: 5, self_service: true })
    expect(knownAgentLimit.value).toBe(5)
    expect(agentSelfService.value).toBe(true)
    expect(createBlock(4)).toBeNull()
    expect(createBlock(5)).toBe('atLimit')
    noteAgentList({ limit: 5, self_service: false })
    expect(createBlock(0)).toBe('noSelfService')
    // Nothing said, nothing forgotten.
    noteAgentList({})
    expect(knownAgentLimit.value).toBe(5)
    expect(agentSelfService.value).toBe(false)
  })
  it('is read from the refusal that carries it', () => {
    const e = new ApiError({
      status: 412,
      code: 'failed_precondition',
      message: 'you have 5 agents that are not suspended',
      details: { limit: 5 },
    })
    expect(limitFromError(e)).toBe(5)
    expect(noteAgentLimit(e)).toBe(true)
    expect(knownAgentLimit.value).toBe(5)
  })
  it('ignores other errors', () => {
    expect(limitFromError(new ApiError({ status: 403, code: 'forbidden', message: 'no' }))).toBeNull()
    expect(
      limitFromError(new ApiError({ status: 412, code: 'failed_precondition', message: 'x', details: { limit: 'x' } })),
    ).toBeNull()
    expect(limitFromError(new Error('boom'))).toBeNull()
    expect(noteAgentLimit(new Error('boom'))).toBe(false)
    expect(knownAgentLimit.value).toBeNull()
  })
})

describe('courseChoices', () => {
  it('offers the courses where the seat allows bringing an agent, first', () => {
    const list = courseChoices(
      [
        seat({ course_id: 'z', code: 'ZZ100', perms: { agent_delegate: 'autonomous', member_manage: 'autonomous' } }),
        seat({ course_id: 'a', code: 'AA100', perms: { agent_delegate: 'denied' } }),
        seat({ course_id: 'm', code: 'MM100' }),
      ],
      null,
    )
    expect(list.map((c) => [c.membership.course_id, c.blocked])).toEqual([
      ['m', null],
      ['z', null],
      ['a', 'noPerm'],
    ])
    expect(list[0].needsApproval).toBe(true)
    expect(list[0].canCourseAgent).toBe(false)
    expect(list[1].needsApproval).toBe(false)
    expect(list[1].canCourseAgent).toBe(true)
  })

  it('says why a course is not offered', () => {
    const list = courseChoices(
      [
        seat({ course_id: 'arch', code: 'A', course_status: 'archived' }),
        seat({ course_id: 'paused', code: 'B', status: 'paused' }),
        seat({ course_id: 'seated', code: 'C' }),
        seat({ course_id: 'asked', code: 'D' }),
        seat({ course_id: 'gone', code: 'E', status: 'removed' }),
      ],
      {
        seats: [{ course_id: 'seated' } as never],
        requests: [{ course_id: 'asked' } as never],
      },
    )
    expect(Object.fromEntries(list.map((c) => [c.membership.course_id, c.blocked]))).toEqual({
      arch: 'archived',
      paused: 'paused',
      seated: 'seated',
      asked: 'requested',
    })
  })

  it('offers a course whose permissions Core did not report, and leaves the rest to Core', () => {
    const [c] = courseChoices([seat({ perms: undefined as never })], null)
    expect(c.blocked).toBeNull()
    expect(c.needsApproval).toBeNull()
    expect(c.canCourseAgent).toBe(true)
  })
})

describe('reach', () => {
  it('says whom a seat reaches, from the owner’s side', () => {
    expect(studentReach('all', null)).toEqual({ kind: 'all' })
    expect(studentReach('listed', [])).toEqual({ kind: 'nobody' })
    expect(studentReach('listed', null)).toEqual({ kind: 'nobody' })
    expect(studentReach('listed', ['M1'], 'm1')).toEqual({ kind: 'you' })
    expect(studentReach('listed', ['m1', 'm2'], 'm1')).toEqual({ kind: 'listed', n: 2 })
    expect(studentReach('listed', ['m2'], 'm1')).toEqual({ kind: 'listed', n: 1 })
  })
  it('says which assignments it reaches', () => {
    expect(assignmentReach('all', [])).toEqual({ kind: 'all' })
    expect(assignmentReach('listed', [])).toEqual({ kind: 'nobody' })
    expect(assignmentReach('listed', ['a', 'b'])).toEqual({ kind: 'listed', n: 2 })
  })
})

describe('permissions', () => {
  it('keeps the permissions and levels this app knows', () => {
    expect(toPermLevels({ document_read: 'autonomous', grade_read: 'bogus', made_up: 'autonomous' })).toEqual({
      document_read: 'autonomous',
    })
  })
  it('lists what is held at all, in the catalogue’s order', () => {
    expect(
      grantedPerms({ conversation_answer: 'autonomous', document_read: 'pending_review', grade_post: 'denied' }),
    ).toEqual([
      { perm: 'document_read', level: 'pending_review' },
      { perm: 'conversation_answer', level: 'autonomous' },
    ])
    expect(grantedPerms(null)).toEqual([])
  })
})

describe('setupProgress', () => {
  const token = (over: Partial<AgentCredential> = {}): AgentCredential => ({
    id: 't',
    kind: 'api_token',
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  })
  const now = Date.parse('2026-06-01T00:00:00Z')

  it('starts with nothing done', () => {
    expect(setupProgress({ credentials: [], lastSeenAt: null, seats: [], requests: [], now })).toEqual({
      token: 'todo',
      connected: 'todo',
      course: 'todo',
    })
  })
  it('waits for a connection once a live token exists', () => {
    expect(setupProgress({ credentials: [token()], lastSeenAt: null, seats: null, requests: [{}], now })).toEqual({
      token: 'done',
      connected: 'waiting',
      course: 'waiting',
    })
  })
  it('does not count a revoked or expired token', () => {
    const p = setupProgress({
      credentials: [token({ revoked_at: '2026-02-01T00:00:00Z' }), token({ expires_at: '2026-05-01T00:00:00Z' })],
      lastSeenAt: null,
      seats: [],
      requests: [],
      now,
    })
    expect(p.token).toBe('todo')
  })
  it('turns green once the agent has been seen and seated', () => {
    expect(
      setupProgress({ credentials: [token()], lastSeenAt: '2026-05-31T23:59:00Z', seats: [{}], requests: [], now }),
    ).toEqual({ token: 'done', connected: 'done', course: 'done' })
  })
})

describe('runtimeAgentFile', () => {
  const ACTOR = '0192f3c1-7d2e-7c3a-9b1f-2a4c6e8f0a1b'

  it('is the agent file the AIshie runtime reads, with the token in the secret it names', () => {
    const f = runtimeAgentFile({ coreUrl: 'https://lms.example.edu', name: 'Study helper', actorId: ACTOR })
    expect(f.yaml).toBe(
      [
        'agent:',
        '  id: study-helper',
        '  display_name: "Study helper"',
        '  core:',
        '    base_url: https://lms.example.edu',
        '    token_ref: secret://agents/study-helper/core_token',
        '  model:',
        '    adapter: openai_chat',
        '    base_url: https://api.deepseek.com',
        '    model: deepseek-chat',
        '    key_ref: secret://agents/study-helper/model_key',
        '',
      ].join('\n'),
    )
    expect(f.id).toBe('study-helper')
    expect(f.tokenFile).toBe('agents/study-helper/core_token')
    // The runtime's own rule (secrets.EnvName): upper case, '_' for all but letters and digits.
    expect(f.tokenVar).toBe('AISHIE_SECRET_AGENTS_STUDY_HELPER_CORE_TOKEN')
    // Neither the variables the runtime does not read, nor Core's MCP path: it finds /mcp itself.
    expect(f.yaml).not.toMatch(/CORE_MCP_URL|AISHIE_TOKEN|\/mcp/)
  })

  it('writes any name so that YAML reads it back as it is', () => {
    const f = runtimeAgentFile({ coreUrl: 'https://lms.example.edu', name: 'Tutor: "A" #1', actorId: ACTOR })
    expect(f.yaml).toContain('  display_name: "Tutor: \\"A\\" #1"\n')
    expect(runtimeAgentFile({ coreUrl: 'x', name: '學習助手', actorId: ACTOR }).yaml).toContain(
      '  display_name: "學習助手"\n',
    )
  })

  it('gives an id the runtime takes, from the name or else the actor', () => {
    expect(runtimeAgentId('Café Bot', ACTOR)).toBe('cafe-bot')
    expect(runtimeAgentId('  --My   agent!!  ', ACTOR)).toBe('my-agent')
    expect(runtimeAgentId('學習助手', ACTOR)).toBe('agent-6e8f0a1b')
    expect(runtimeAgentId('', '')).toBe('agent')
    const long = runtimeAgentId('a'.repeat(47) + ' b c', ACTOR)
    expect(long).toBe('a'.repeat(47))
    for (const name of ['Study helper', '學習助手', 'x'.repeat(200), '!!!', 'Ünïcödé Tutor']) {
      expect(runtimeAgentId(name, ACTOR)).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
    }
  })
})
