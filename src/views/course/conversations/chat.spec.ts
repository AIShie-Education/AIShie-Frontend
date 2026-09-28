import { describe, expect, it } from 'vitest'
import type { ConversationMessage, ConversationView } from '@/api/types'
import {
  AGENT_ANSWERS_ELSEWHERE,
  answersElsewhere,
  availabilityOf,
  BODY_MAX,
  bodyProblem,
  byActivity,
  charCount,
  chatStatus,
  cleanBody,
  closedReasonOf,
  draftKey,
  firstSeq,
  getDraft,
  isSendKey,
  lastSeq,
  mergeMessages,
  offeredIn,
  pollDelayMs,
  POLL_MS,
  retractedBy,
  roleIn,
  sameMessages,
  setDraft,
  stateOf,
  visibleToLines,
} from './chat'

const NOW = Date.parse('2026-09-26T12:00:00Z')

function msg(seq: number, over: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: `m${seq}`,
    seq,
    author_member_id: seq % 2 ? 'opener' : 'agent',
    body: `message ${seq}`,
    created_at: new Date(NOW + seq * 1000).toISOString(),
    ...over,
  }
}

function view(
  over: Partial<ConversationView> = {},
  respondent: Partial<ConversationView['respondent']> = {},
): ConversationView {
  return {
    id: 'c1',
    status: 'open',
    state: 'answered',
    created_at: '2026-09-26T11:00:00Z',
    opener: { member_id: 'opener', display_name: 'Chan Tai Man', kind: 'human' },
    respondent: {
      member_id: 'agent',
      display_name: 'Course tutor',
      kind: 'agent',
      role: 'assistant',
      seat_status: 'active',
      is_delegate_of_opener: false,
      answer_level: 'autonomous',
      last_seen_at: new Date(NOW - 30_000).toISOString(),
      ...respondent,
    },
    latest_opener_message_id: 'm1',
    ...over,
  }
}

describe('mergeMessages', () => {
  it('orders by seq whatever order the pages came in', () => {
    const older = [msg(1), msg(2)]
    const newer = [msg(3), msg(4)]
    expect(mergeMessages(newer, older).map((m) => m.seq)).toEqual([1, 2, 3, 4])
  })

  it('keeps one copy of a message read twice (pages overlap), the newer copy', () => {
    const held = [msg(1), msg(2), msg(3)]
    const again = [msg(3, { body: null, retracted: { at: '2026-09-26T12:01:00Z', by_member_id: 'opener' } }), msg(4)]
    const out = mergeMessages(held, again)
    expect(out.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4'])
    expect(out[2]!.retracted).toBeTruthy()
    expect(out[2]!.body).toBeNull()
  })

  it('treats two messages under one seq as one, keeping the one read last', () => {
    const out = mergeMessages([msg(5, { id: 'a' })], [msg(5, { id: 'b' })])
    expect(out.map((m) => m.id)).toEqual(['b'])
  })

  it('moves a message whose seq changed rather than keeping it twice', () => {
    const out = mergeMessages([msg(5, { id: 'x' })], [msg(6, { id: 'x' })])
    expect(out.map((m) => [m.id, m.seq])).toEqual([['x', 6]])
  })

  it('takes an empty or missing page as nothing new', () => {
    const held = [msg(1)]
    expect(mergeMessages(held, null)).toEqual(held)
    expect(mergeMessages(held, [])).toEqual(held)
    expect(mergeMessages(held, [])).not.toBe(held)
  })

  it('gives the cursors: the last seq to poll after and the first to read before', () => {
    const ms = mergeMessages([], [msg(7), msg(3), msg(5)])
    expect(lastSeq(ms)).toBe(7)
    expect(firstSeq(ms)).toBe(3)
    expect(lastSeq([])).toBeNull()
    expect(firstSeq([])).toBeNull()
  })

  it('tells whether anything shown changed', () => {
    const a = [msg(1), msg(2)]
    expect(sameMessages(a, mergeMessages(a, [msg(2)]))).toBe(true)
    expect(sameMessages(a, mergeMessages(a, [msg(3)]))).toBe(false)
    expect(sameMessages(a, mergeMessages(a, [msg(2, { retracted: { at: 'x' }, body: null })]))).toBe(false)
  })
})

describe('bodies', () => {
  it('counts characters as Core does (code points)', () => {
    expect(charCount('abc')).toBe(3)
    expect(charCount('你好')).toBe(2)
    expect(charCount('😀x')).toBe(2)
    expect(charCount('')).toBe(0)
    expect(charCount(null)).toBe(0)
  })

  it('sends a draft without blank lines before it or white space after it, keeping indentation', () => {
    expect(cleanBody('\n\n  def f():\n    return 1\n\n  ')).toBe('  def f():\n    return 1')
    expect(cleanBody('hello  ')).toBe('hello')
  })

  it('refuses an empty draft and one over the limit', () => {
    expect(bodyProblem('   \n ')).toBe('empty')
    expect(bodyProblem('x'.repeat(BODY_MAX))).toBeNull()
    expect(bodyProblem('x'.repeat(BODY_MAX + 1))).toBe('tooLong')
    // Trailing white space does not count against the limit: it is not sent.
    expect(bodyProblem('x'.repeat(BODY_MAX) + '\n\n')).toBeNull()
    expect(bodyProblem('😀'.repeat(BODY_MAX))).toBeNull()
  })
})

describe('isSendKey', () => {
  it('sends on Enter, and not on Shift+Enter (a new line)', () => {
    expect(isSendKey({ key: 'Enter' })).toBe(true)
    expect(isSendKey({ key: 'Enter', shiftKey: true })).toBe(false)
    expect(isSendKey({ key: 'a' })).toBe(false)
  })

  it('never sends while an input method is composing', () => {
    expect(isSendKey({ key: 'Enter', isComposing: true })).toBe(false)
    // Safari: the composition has ended, but the Enter was the IME's.
    expect(isSendKey({ key: 'Enter', keyCode: 229 })).toBe(false)
    // Known only from the composition events around it.
    expect(isSendKey({ key: 'Enter' }, { composing: true })).toBe(false)
    expect(isSendKey({ key: 'Enter', ctrlKey: true, isComposing: true })).toBe(false)
  })

  it('makes Enter a new line where asked (touch keyboards), with Ctrl/⌘+Enter still sending', () => {
    expect(isSendKey({ key: 'Enter' }, { enterSends: false })).toBe(false)
    expect(isSendKey({ key: 'Enter', ctrlKey: true }, { enterSends: false })).toBe(true)
    expect(isSendKey({ key: 'Enter', metaKey: true }, { enterSends: false })).toBe(true)
    expect(isSendKey({ key: 'Enter', altKey: true })).toBe(false)
  })
})

describe('roles and states', () => {
  it('finds the caller’s part', () => {
    expect(roleIn(view(), 'opener')).toBe('opener')
    expect(roleIn(view(), 'agent')).toBe('respondent')
    expect(roleIn(view(), 'staff')).toBe('overseer')
    expect(roleIn(view(), null)).toBe('overseer')
  })

  it('reads a closed status as closed whatever the state says, and an unknown state as answered', () => {
    expect(stateOf({ status: 'closed', state: 'awaiting_answer' })).toBe('closed')
    expect(stateOf({ status: 'open', state: 'reply_pending_approval' })).toBe('reply_pending_approval')
    expect(stateOf({ status: 'open', state: 'something_new' })).toBe('answered')
  })

  it('tells how likely an answer is', () => {
    const seen = (ms: number) => new Date(NOW - ms).toISOString()
    expect(availabilityOf({ kind: 'agent', last_seen_at: seen(10_000) }, NOW)).toBe('online')
    expect(availabilityOf({ kind: 'agent', last_seen_at: seen(3_600_000) }, NOW)).toBe('offline')
    expect(availabilityOf({ kind: 'agent', last_seen_at: null }, NOW)).toBe('never')
    expect(availabilityOf({ kind: 'human' }, NOW)).toBe('human')
    expect(availabilityOf({ kind: 'agent', seat_status: 'paused' }, NOW)).toBe('paused')
    expect(availabilityOf({ kind: 'agent', seat_status: 'removed' }, NOW)).toBe('gone')
    expect(availabilityOf({ kind: 'agent', seat_status: 'expired' }, NOW)).toBe('gone')
    expect(availabilityOf({ kind: 'agent', answer_level: 'denied', last_seen_at: seen(0) }, NOW)).toBe('notAnswering')
  })

  it('translates only the closing code; anything else is the closer’s own words', () => {
    expect(closedReasonOf('seat_removed')).toEqual({ code: 'seat_removed' })
    expect(closedReasonOf('  Thanks, all sorted ')).toEqual({ text: 'Thanks, all sorted' })
    expect(closedReasonOf('')).toBeNull()
    expect(closedReasonOf(null)).toBeNull()
  })
})

describe('chatStatus', () => {
  const at = { now: NOW }

  it('shows the opener the respondent at work while an answer is awaited', () => {
    const s = chatStatus(view({ state: 'awaiting_answer' }), 'opener', at)
    expect(s.typing).toBe(true)
    expect(s.block).toBeNull()
    expect(s.notice).toEqual({ kind: 'waiting', availability: 'online', approval: false })
  })

  it('warns the opener when nothing runs the agent, and when answers need approval', () => {
    const never = chatStatus(
      view({ state: 'awaiting_answer' }, { last_seen_at: null, answer_level: 'confirm_required' }),
      'opener',
      at,
    )
    expect(never.notice).toEqual({ kind: 'waiting', availability: 'never', approval: true })
    const offline = chatStatus(
      view({ state: 'awaiting_answer' }, { last_seen_at: '2026-09-25T00:00:00Z' }),
      'opener',
      at,
    )
    expect(offline.notice).toMatchObject({ availability: 'offline' })
  })

  it('stops the opener writing to someone who can no longer answer', () => {
    for (const [r, a] of [
      [{ seat_status: 'removed' }, 'gone'],
      [{ seat_status: 'paused' }, 'paused'],
      [{ answer_level: 'denied' }, 'notAnswering'],
    ] as const) {
      const s = chatStatus(view({ state: 'awaiting_answer' }, r), 'opener', at)
      expect(s.block).toBe('unavailable')
      expect(s.typing).toBe(false)
      expect(s.notice).toEqual({ kind: 'unavailable', availability: a })
    }
  })

  it('says an answer waits for approval, and lets the opener write on', () => {
    const s = chatStatus(view({ state: 'reply_pending_approval' }), 'opener', at)
    expect(s.notice).toEqual({ kind: 'pendingApproval', mine: false })
    expect(s.block).toBeNull()
    expect(s.typing).toBe(false)
  })

  it('invites the first question in an empty conversation, and says nothing once answered', () => {
    expect(chatStatus(view(), 'opener', { ...at, empty: true }).notice).toEqual({ kind: 'start' })
    expect(chatStatus(view(), 'opener', at).notice).toBeNull()
  })

  it('makes a closed conversation read-only for everyone, with why', () => {
    for (const me of ['opener', 'agent', 'staff']) {
      const s = chatStatus(view({ status: 'closed', state: 'closed', closed_reason: 'seat_removed' }), me, at)
      expect(s.block).toBe('closed')
      expect(s.notice).toEqual({ kind: 'closed', reason: { code: 'seat_removed' } })
    }
  })

  it('has the respondent answer the opener’s latest message', () => {
    const s = chatStatus(view({ state: 'awaiting_answer', latest_opener_message_id: 'm9' }), 'agent', at)
    expect(s.role).toBe('respondent')
    expect(s.notice).toEqual({ kind: 'yourTurn' })
    expect(s.block).toBeNull()
    expect(s.replyTo).toBe('m9')
    expect(s.typing).toBe(false)
  })

  it('holds the respondent back while their answer waits, and until something is asked', () => {
    expect(chatStatus(view({ state: 'reply_pending_approval' }), 'agent', at)).toMatchObject({
      block: 'answerPending',
      notice: { kind: 'pendingApproval', mine: true },
    })
    expect(chatStatus(view({ latest_opener_message_id: null }), 'agent', at).block).toBe('nothingToAnswer')
    // Answered already: they may add to it.
    expect(chatStatus(view({ state: 'answered' }), 'agent', at).block).toBeNull()
  })

  it('lets staff read, never write', () => {
    expect(chatStatus(view({ state: 'awaiting_answer' }), 'staff', at)).toMatchObject({
      role: 'overseer',
      block: 'overseer',
      typing: false,
      notice: { kind: 'overseeing' },
    })
    expect(chatStatus(view({ state: 'reply_pending_approval' }), 'staff', at).notice).toEqual({
      kind: 'pendingApproval',
      mine: false,
    })
  })

  it('tells the opener an agent that is no longer offered takes no conversations in the site', () => {
    for (const state of ['answered', 'awaiting_answer', 'reply_pending_approval'] as const) {
      const s = chatStatus(view({ state }), 'opener', { ...at, offered: false })
      expect(s.block).toBe('elsewhere')
      expect(s.notice).toEqual({ kind: 'elsewhere' })
      expect(s.typing).toBe(false)
    }
    // Offered, or not known yet: as before.
    expect(chatStatus(view({ state: 'awaiting_answer' }), 'opener', { ...at, offered: true }).block).toBeNull()
    expect(chatStatus(view({ state: 'awaiting_answer' }), 'opener', { ...at, offered: null }).block).toBeNull()
  })

  it('says first that an agent has left, is paused or does not answer, which being offered would not change', () => {
    const s = chatStatus(view({}, { seat_status: 'paused' }), 'opener', { ...at, offered: false })
    expect(s.notice).toEqual({ kind: 'unavailable', availability: 'paused' })
  })

  it('never says it of a person, nor to the one answering or staff, nor of a closed conversation', () => {
    const person = view({}, { kind: 'human', last_seen_at: null })
    expect(chatStatus(person, 'opener', { ...at, offered: false }).block).toBeNull()
    expect(chatStatus(view({ state: 'awaiting_answer' }), 'agent', { ...at, offered: false }).block).toBeNull()
    expect(chatStatus(view(), 'staff', { ...at, offered: false }).block).toBe('overseer')
    const closed = chatStatus(view({ status: 'closed', state: 'closed' }), 'opener', { ...at, offered: false })
    expect(closed.block).toBe('closed')
  })

  it('follows the conversation from question to answer to close', () => {
    const steps: [Partial<ConversationView>, string, boolean][] = [
      [{ state: 'answered' }, 'start', false],
      [{ state: 'awaiting_answer' }, 'waiting', true],
      [{ state: 'reply_pending_approval' }, 'pendingApproval', false],
      [{ state: 'answered' }, 'none', false],
      [{ status: 'closed', state: 'closed' }, 'closed', false],
    ]
    steps.forEach(([v, notice, typing], i) => {
      const s = chatStatus(view(v), 'opener', { ...at, empty: i === 0 })
      expect(s.notice?.kind ?? 'none').toBe(notice)
      expect(s.typing).toBe(typing)
    })
  })
})

describe('retractedBy', () => {
  const r = (by: string | null) => ({ author_member_id: 'opener', retracted: { at: 'x', by_member_id: by } })
  it('says who withdrew a message', () => {
    expect(retractedBy(r('opener'), 'opener')).toBe('you')
    expect(retractedBy(r('opener'), 'agent')).toBe('author')
    expect(retractedBy(r(null), 'agent')).toBe('author')
    expect(retractedBy(r('staff'), 'agent')).toBe('staff')
    expect(retractedBy({ author_member_id: 'opener', retracted: null }, 'opener')).toBeNull()
  })
})

describe('visibleToLines', () => {
  it('translates the codes Core sends and shows any other as sent', () => {
    expect(
      visibleToLines(['participants', 'overseers', 'action_record', 'respondent_answers_others', 'the_dean']),
    ).toEqual([
      { key: 'participants' },
      { key: 'overseers' },
      { key: 'actionRecord' },
      { key: 'respondentAnswersOthers' },
      { text: 'the_dean' },
    ])
  })

  it('says what Core says of every conversation before it has said it', () => {
    expect(visibleToLines(null).map((l) => ('key' in l ? l.key : l.text))).toEqual([
      'participants',
      'overseers',
      'actionRecord',
    ])
    expect(visibleToLines([], { answersOthers: true }).map((l) => ('key' in l ? l.key : l.text))).toEqual([
      'participants',
      'overseers',
      'actionRecord',
      'respondentAnswersOthers',
    ])
  })
})

describe('pollDelayMs', () => {
  it('polls every few seconds while an answer is expected', () => {
    expect(pollDelayMs('awaiting_answer', 100)).toBe(POLL_MS)
    expect(pollDelayMs('reply_pending_approval', 100)).toBe(POLL_MS)
  })
  it('slows down the longer an answered conversation stays quiet, and stops once closed', () => {
    expect(pollDelayMs('answered', 0)).toBe(POLL_MS)
    expect(pollDelayMs('answered', 5)).toBe(10_000)
    expect(pollDelayMs('answered', 50)).toBe(30_000)
    expect(pollDelayMs('closed', 0)).toBeNull()
  })
})

describe('byActivity', () => {
  it('puts the latest activity first, a conversation without messages by when it started', () => {
    const list = [
      { id: 'a', created_at: '2026-09-01T00:00:00Z', last_message_at: '2026-09-20T00:00:00Z' },
      { id: 'b', created_at: '2026-09-25T00:00:00Z', last_message_at: null },
      { id: 'c', created_at: '2026-09-02T00:00:00Z', last_message_at: '2026-09-26T00:00:00Z' },
    ]
    expect(byActivity(list).map((c) => c.id)).toEqual(['c', 'b', 'a'])
    expect(list.map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('drafts', () => {
  it('keeps what was typed per conversation, and per whom a new one is for', () => {
    const k1 = draftKey('course', 'c1')
    const k2 = draftKey('course', null, 'agent')
    expect(k1).not.toBe(k2)
    setDraft(k1, 'half a question')
    expect(getDraft(k1)).toBe('half a question')
    expect(getDraft(k2)).toBe('')
    setDraft(k1, '')
    expect(getDraft(k1)).toBe('')
  })
})

describe('site chat', () => {
  it('knows Core’s refusal of a question to an agent operated from outside, whatever its code', () => {
    expect(AGENT_ANSWERS_ELSEWHERE).toBe('agent_answers_elsewhere')
    expect(answersElsewhere({ details: { reason: 'agent_answers_elsewhere' } })).toBe(true)
    expect(answersElsewhere({ details: { reason: 'not_addressable' } })).toBe(false)
    expect(answersElsewhere({ details: null })).toBe(false)
    expect(answersElsewhere(null)).toBe(false)
  })

  it('says whether someone is offered by whom the caller may ask, or nothing before that is read', () => {
    const list = [{ member_id: 'a' }, { member_id: 'b' }]
    expect(offeredIn(list, 'a')).toBe(true)
    expect(offeredIn(list, 'c')).toBe(false)
    expect(offeredIn([], 'a')).toBe(false)
    expect(offeredIn(null, 'a')).toBeNull()
  })
})
