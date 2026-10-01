import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemberSummary } from '@/api/types'

let pages: { members: Partial<MemberSummary>[]; next?: string }[] = []
let asked: Record<string, unknown>[] = []
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn((_tool: string, args: Record<string, unknown>) => {
      asked.push(args)
      return Promise.resolve(pages.shift() ?? { members: [] })
    }),
  }
})

import {
  agentRows,
  levelOf,
  loadAllMembers,
  minLevel,
  notAskable,
  policyOf,
  POLICY_LEVEL,
  presenceFor,
  tallyLevels,
} from './courseAgents'

const NOW = new Date('2026-09-26T12:00:00Z').getTime()
let n = 0
function seat(over: Partial<MemberSummary>): MemberSummary {
  n++
  return {
    id: `m${n}`,
    actor_id: `a${n}`,
    display_name: `Seat ${n}`,
    kind: 'human',
    role: 'student',
    status: 'active',
    student_scope: 'listed',
    assignment_scope: 'all',
    created_at: '2026-09-01T00:00:00Z',
    perms: {},
    ...over,
  } as MemberSummary
}

const presets = new Map([
  ['p-tutor', { name: 'course_tutor', dept_id: null }],
  ['p-deleg', { name: 'delegate', dept_id: null }],
  ['p-grader', { name: 'grader', dept_id: null }],
  ['p-dept', { name: 'course_tutor', dept_id: 'd1' }],
])

beforeEach(() => {
  pages = []
  asked = []
})

describe('levels', () => {
  it('reads a level, failing closed', () => {
    expect(levelOf({ conversation_ask: 'autonomous' }, 'conversation_ask')).toBe('autonomous')
    expect(levelOf({}, 'conversation_ask')).toBe('denied')
    expect(levelOf({ conversation_ask: 'bogus' }, 'conversation_ask')).toBe('denied')
    expect(levelOf(null, 'x')).toBe('denied')
  })
  it('takes the lower of two', () => {
    expect(minLevel('autonomous', 'pending_review')).toBe('pending_review')
    expect(minLevel('confirm_required', 'autonomous')).toBe('confirm_required')
    expect(minLevel(undefined, 'autonomous')).toBe('denied')
  })
})

describe('agentRows', () => {
  const instructor = seat({ role: 'instructor', perms: { conversation_ask: 'autonomous' } })
  const student = seat({ display_name: 'Yuki', perms: { conversation_ask: 'autonomous' } })
  const quietTeacher = seat({ role: 'ta', perms: { conversation_ask: 'pending_review' } })

  it('groups agents by what they are for, people left out', () => {
    const tutor = seat({
      kind: 'agent',
      role: 'assistant',
      display_name: 'Bot',
      preset_id: 'p-tutor',
      principal_member_id: instructor.id,
      perms: { conversation_answer: 'autonomous' },
    })
    const helper = seat({
      kind: 'agent',
      role: 'assistant',
      display_name: 'Helper',
      preset_id: 'p-deleg',
      principal_member_id: student.id,
      perms: { conversation_answer: 'autonomous' },
    })
    const grader = seat({ kind: 'agent', role: 'assistant', display_name: 'Grader', preset_id: 'p-grader' })
    const rows = agentRows([instructor, student, grader, helper, tutor], presets, NOW)
    expect(rows.map((r) => [r.member.display_name, r.group, r.purpose])).toEqual([
      ['Bot', 'course', 'course'],
      ['Helper', 'personal', 'personal'],
      ['Grader', 'unowned', null],
    ])
    expect(rows[0]!.principal).toBe(instructor)
    expect(rows[0]!.presetName).toBe('course_tutor')
  })

  it('reads what the seat records of whom it answers before the preset', () => {
    const own = seat({
      kind: 'agent',
      role: 'assistant',
      display_name: 'My helper',
      preset_id: 'p-tutor',
      principal_member_id: instructor.id,
      answers_course: false,
    })
    const dept = seat({
      kind: 'agent',
      role: 'assistant',
      display_name: 'Dept tutor',
      preset_id: 'p-dept',
      principal_member_id: instructor.id,
      answers_course: true,
    })
    const rows = agentRows([instructor, own, dept], presets, NOW)
    expect(rows.map((r) => [r.member.display_name, r.group, r.purpose])).toEqual([
      ['Dept tutor', 'course', 'course'],
      ['My helper', 'personal', 'personal'],
    ])
  })

  it('does not read a purpose from a department preset that shares a built-in name', () => {
    const a = seat({
      kind: 'agent',
      role: 'assistant',
      preset_id: 'p-dept',
      principal_member_id: student.id,
    })
    const [row] = agentRows([student, a], presets, NOW)
    expect(row!.purpose).toBeNull()
    // Without a purpose, a student's agent is taken for their own assistant.
    expect(row!.group).toBe('personal')
  })

  it("caps a delegate's answering by its owner's asking, as Core does", () => {
    const a = seat({
      kind: 'agent',
      role: 'assistant',
      preset_id: 'p-tutor',
      principal_member_id: quietTeacher.id,
      perms: { conversation_answer: 'autonomous' },
    })
    const [row] = agentRows([quietTeacher, a], presets, NOW)
    expect(row!.ownAnswer).toBe('autonomous')
    expect(row!.answer).toBe('pending_review')
    expect(row!.answerCapped).toBe(true)
  })

  it('answers nothing while it or its owner is paused, or once it has ended', () => {
    const pausedOwner = seat({ role: 'instructor', status: 'paused', perms: { conversation_ask: 'autonomous' } })
    const a = seat({
      kind: 'agent',
      role: 'assistant',
      principal_member_id: pausedOwner.id,
      perms: { conversation_answer: 'autonomous' },
    })
    const b = seat({
      kind: 'agent',
      role: 'assistant',
      status: 'paused',
      perms: { conversation_answer: 'autonomous' },
    })
    const c = seat({
      kind: 'agent',
      role: 'assistant',
      expires_at: '2026-09-01T00:00:00Z',
      perms: { conversation_answer: 'autonomous' },
    })
    const rows = agentRows([pausedOwner, a, b, c], presets, NOW)
    const byId = new Map(rows.map((r) => [r.member.id, r]))
    expect(byId.get(a.id)!.answer).toBe('denied')
    expect(byId.get(b.id)!.answer).toBe('denied')
    expect(byId.get(c.id)!.answer).toBe('denied')
    expect(byId.get(c.id)!.live).toBe(false)
    // A paused seat is not "capped": it is paused, which the row says.
    expect(byId.get(b.id)!.answerCapped).toBe(false)
    // Ended seats go last.
    expect(rows[rows.length - 1]!.member.id).toBe(c.id)
  })
})

describe('tallyLevels', () => {
  it('finds what most live students hold, leaving out the caller and ended seats', () => {
    const me = seat({ perms: { agent_delegate: 'denied' } })
    const members = [
      me,
      seat({ perms: { agent_delegate: 'confirm_required' } }),
      seat({ perms: { agent_delegate: 'confirm_required' } }),
      seat({ perms: { agent_delegate: 'autonomous' } }),
      seat({ status: 'removed', perms: { agent_delegate: 'autonomous' } }),
      seat({ expires_at: '2026-01-01T00:00:00Z', perms: { agent_delegate: 'autonomous' } }),
      seat({ role: 'ta', perms: { agent_delegate: 'autonomous' } }),
      seat({ status: 'paused', perms: { agent_delegate: 'autonomous' } }),
    ]
    const t = tallyLevels(members, 'student', 'agent_delegate', { exceptId: me.id, now: NOW })
    expect(t.total).toBe(4)
    expect(t.counts).toEqual({ confirm_required: 2, autonomous: 2 })
    expect(t.majority).toBeNull() // a tie
    expect(t.others).toBe(2)
    members.push(seat({ perms: {} }), seat({ perms: {} }), seat({ perms: {} }))
    const u = tallyLevels(members, 'student', 'agent_delegate', { exceptId: me.id, now: NOW })
    expect(u.majority).toBe('denied')
    expect(u.others).toBe(4)
  })
  it('has no majority with nobody', () => {
    expect(tallyLevels([], 'student', 'agent_delegate')).toEqual({ total: 0, counts: {}, majority: null, others: 0 })
  })
})

describe('student agent policy', () => {
  it('maps the three choices to levels and back', () => {
    for (const [p, l] of Object.entries(POLICY_LEVEL)) expect(policyOf(l)).toBe(p)
    expect(policyOf('pending_review')).toBeNull()
    expect(policyOf(null)).toBeNull()
  })
})

describe('notAskable', () => {
  it('says an agent with MCP access is never asked on the site, whatever else is said of it', () => {
    expect(notAskable({ kind: 'agent', hosting: 'mcp', site_chat: false })).toBe('mcp')
    expect(notAskable({ kind: 'agent', hosting: 'mcp' })).toBe('mcp')
  })
  it('says an agent hosted on AIshie is not asked while the site’s runtime does not run it', () => {
    expect(notAskable({ kind: 'agent', hosting: 'runtime', site_chat: false })).toBe('notRunning')
    expect(notAskable({ kind: 'agent', hosting: 'runtime', site_chat: true })).toBeNull()
  })
  it('says nothing where Core says nothing, or of a person', () => {
    expect(notAskable({ kind: 'agent', hosting: 'runtime' })).toBeNull()
    expect(notAskable({ kind: 'agent', hosting: null, site_chat: false })).toBeNull()
    expect(notAskable({ kind: 'agent' })).toBeNull()
    expect(notAskable({ kind: 'human' })).toBeNull()
  })
})

describe('presenceFor', () => {
  it('prefers what conversation.respondents says, then agent.list, and knows when neither says', () => {
    const m = { id: 'm1', actor_id: 'a1' }
    expect(presenceFor(m, new Map([['a1', 'T1']]), new Map([['m1', 'T2']]))).toEqual({ known: true, value: 'T2' })
    expect(presenceFor(m, new Map([['a1', null]]), new Map())).toEqual({ known: true, value: null })
    expect(presenceFor(m, new Map(), new Map())).toEqual({ known: false, value: null })
  })
})

describe('loadAllMembers', () => {
  it('pages to the end', async () => {
    pages = [{ members: [seat({})], next: 'x' }, { members: [seat({})] }]
    const out = await loadAllMembers('c1')
    expect(out.members).toHaveLength(2)
    expect(out.complete).toBe(true)
    expect(asked.map((a) => a.after)).toEqual([undefined, 'x'])
  })
  it('stops after the page limit, and says so', async () => {
    pages = [
      { members: [seat({})], next: 'x' },
      { members: [seat({})], next: 'y' },
    ]
    const out = await loadAllMembers('c1', 2)
    expect(out.complete).toBe(false)
  })
})
