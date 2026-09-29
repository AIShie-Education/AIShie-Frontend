import { afterEach, describe, expect, it } from 'vitest'
import { setLocale } from '@/i18n'
import {
  aboveCeiling,
  capToCeilings,
  ceilingNote,
  ceilingOf,
  ceilingRefusalText,
  ceilingReasonText,
  ceilingsOf,
  newSeatCeilings,
} from './ceilings'

afterEach(() => setLocale('en'))

// A student's agent, as member.get says it: capped by its owner's seat, by
// what it does only by proposal, and never bringing agents of its own.
const studentAgent = {
  perm_ceilings: {
    document_read: 'autonomous',
    submission_write: 'confirm_required',
    action_decide: 'confirm_required',
    agent_delegate: 'denied',
    member_manage: 'denied',
    conversation_answer: 'denied',
  },
  perm_ceiling_reasons: {
    submission_write: 'student_agent_by_proposal',
    action_decide: 'agent_decides_by_proposal',
    agent_delegate: 'agent_never',
    member_manage: 'principal_level',
    conversation_answer: 'principal_level',
    // Said of a permission at autonomous: nothing caps it, whatever the reason says.
    document_read: 'principal_level',
  },
}

describe('ceilingsOf', () => {
  it('reads each permission’s ceiling and the reason for each one below autonomous', () => {
    const c = ceilingsOf(studentAgent)!
    expect(c.levels.submission_write).toBe('confirm_required')
    expect(c.levels.document_read).toBe('autonomous')
    expect(c.reasons.submission_write).toBe('student_agent_by_proposal')
    expect(c.reasons.document_read).toBeUndefined()
  })
  it('is null for a seat whose view says no ceilings (a Core from before them)', () => {
    expect(ceilingsOf({ perm_ceilings: undefined })).toBeNull()
    expect(ceilingsOf(null)).toBeNull()
  })
  it('holds nothing against a permission Core left out, or a level it does not know', () => {
    const c = ceilingsOf({ perm_ceilings: { action_decide: 'sometimes' } })!
    expect(ceilingOf(c, 'action_decide')).toBeNull()
    expect(ceilingOf(c, 'grade_post')).toBeNull()
    expect(aboveCeiling(c, 'grade_post', 'autonomous')).toBe(false)
  })
})

describe('what a ceiling allows', () => {
  const c = ceilingsOf(studentAgent)
  it('greys out only the levels above it', () => {
    expect(aboveCeiling(c, 'action_decide', 'autonomous')).toBe(true)
    expect(aboveCeiling(c, 'action_decide', 'pending_review')).toBe(true)
    expect(aboveCeiling(c, 'action_decide', 'confirm_required')).toBe(false)
    expect(aboveCeiling(c, 'action_decide', 'denied')).toBe(false)
    expect(aboveCeiling(c, 'agent_delegate', 'confirm_required')).toBe(true)
    expect(aboveCeiling(c, 'document_read', 'autonomous')).toBe(false)
    expect(aboveCeiling(null, 'action_decide', 'autonomous')).toBe(false)
  })
  it('cuts levels down to it, as Core cuts a preset’s when it seats someone', () => {
    expect(
      capToCeilings({ action_decide: 'autonomous', submission_write: 'autonomous', document_read: 'autonomous' }, c),
    ).toEqual({ action_decide: 'confirm_required', submission_write: 'confirm_required', document_read: 'autonomous' })
    expect(capToCeilings({ action_decide: 'autonomous' }, null)).toEqual({ action_decide: 'autonomous' })
  })
})

describe('the words for a ceiling', () => {
  const c = ceilingsOf(studentAgent)
  it('say how far a capped permission may go, and why', () => {
    expect(ceilingNote(c, 'action_decide')).toBe(
      'At most “Needs approval” here: an agent decides and reviews only by proposal, which a person then confirms.',
    )
    expect(ceilingNote(c, 'submission_write')).toContain('does this only by proposal')
    expect(ceilingNote(c, 'document_read')).toBeNull()
  })
  it('say a permission capped at denied is never held', () => {
    expect(ceilingNote(c, 'agent_delegate')).toBe(
      'Never held here: an agent acting for someone brings in no agents of its own.',
    )
  })
  it('say an agent’s answers follow what its owner may ask', () => {
    expect(ceilingReasonText('principal_level', 'conversation_answer')).toBe(
      'an agent acting for someone answers no more freely than that person may ask',
    )
    expect(ceilingReasonText('principal_level', 'member_manage')).toBe(
      'an agent acting for someone never holds more than that person does',
    )
  })
  it('give a reason this app does not know as Core named it', () => {
    expect(ceilingReasonText('new_rule', 'grade_post')).toBe('new_rule')
  })
  it('are in the reader’s language', () => {
    setLocale('zh-Hant')
    expect(ceilingNote(c, 'action_decide')).toBe(
      '這裡最多只能是「需批准」：代理只能以提案的方式作出決定與覆核，並須由人確認。',
    )
    setLocale('zh-Hans')
    expect(ceilingNote(c, 'action_decide')).toBe(
      '这里最多只能是“需审批”：智能体只能以提议的方式作出决定与审核，并须由人确认。',
    )
  })
})

describe('ceilingRefusalText', () => {
  it('puts Core’s refusal above a ceiling in words', () => {
    expect(
      ceilingRefusalText({
        reason: 'agent_decides_by_proposal',
        permission: 'action_decide',
        ceiling: 'confirm_required',
      }),
    ).toBe(
      'Approve & review can be at most “Needs approval” here, because an agent decides and reviews only by proposal, which a person then confirms.',
    )
    expect(ceilingRefusalText({ reason: 'agent_never', permission: 'agent_delegate', ceiling: 'denied' })).toBe(
      'Bring in own agents cannot be given here at all, because an agent acting for someone brings in no agents of its own.',
    )
    setLocale('zh-Hant')
    expect(
      ceilingRefusalText({
        reason: 'student_agent_by_proposal',
        permission: 'submission_write',
        ceiling: 'confirm_required',
      }),
    ).toMatch(/^撰寫提交在這裡最多只能是「需批准」，因為/)
  })
  it('says why a person cannot be given conversation_answer, in each language', () => {
    const refusal = { reason: 'conversations_are_with_agents', permission: 'conversation_answer', ceiling: 'denied' }
    expect(ceilingRefusalText(refusal)).toBe(
      'Answer questions cannot be given here at all, because conversations are with agents, and a person answers none of them.',
    )
    setLocale('zh-Hant')
    expect(ceilingRefusalText(refusal)).toMatch(/在這裡完全不能授予，因為對話只與代理進行，真人不回答任何對話。$/)
    setLocale('zh-Hans')
    expect(ceilingRefusalText(refusal)).toMatch(/在这里完全不能授予，因为对话只与智能体进行，真人不回答任何对话。$/)
  })
  it('says nothing of any other refusal', () => {
    expect(ceilingRefusalText({ reason: 'permission_denied' })).toBeNull()
    expect(ceilingRefusalText({ reason: 'agent_never' })).toBeNull()
    expect(ceilingRefusalText(undefined)).toBeNull()
  })
})

describe('newSeatCeilings', () => {
  it('keeps an agent seated with member.add to deciding by proposal, and a person from answering conversations', () => {
    const c = newSeatCeilings('agent')
    expect(ceilingOf(c, 'action_decide')).toBe('confirm_required')
    expect(c?.reasons.action_decide).toBe('agent_decides_by_proposal')
    expect(ceilingOf(c, 'grade_post')).toBeNull()
    expect(ceilingOf(c, 'conversation_answer')).toBeNull()
    const person = newSeatCeilings('human')
    expect(ceilingOf(person, 'conversation_answer')).toBe('denied')
    expect(person?.reasons.conversation_answer).toBe('conversations_are_with_agents')
    expect(ceilingOf(person, 'action_decide')).toBeNull()
    expect(newSeatCeilings(null)).toBeNull()
  })
})
