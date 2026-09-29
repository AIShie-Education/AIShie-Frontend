import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationView } from '@/api/types'
import { awaitsAnswer, freshMemory, isUnread, loadMemory, PENDING_MAX, saveMemory, SEEN_MAX } from './unread'

const since = '2026-09-01T00:00:00Z'

function view(over: Partial<ConversationView> = {}): ConversationView {
  return {
    id: 'c1',
    status: 'open',
    state: 'answered',
    created_at: '2026-09-20T10:00:00Z',
    last_message_at: '2026-09-20T10:05:00Z',
    last_author_member_id: 'tutor',
    opener: { member_id: 'me', display_name: 'Chan Tai Man', kind: 'human' },
    respondent: {
      member_id: 'tutor',
      display_name: 'Course tutor',
      kind: 'agent',
      role: 'assistant',
      seat_status: 'active',
      is_delegate_of_opener: false,
      answer_level: 'autonomous',
    },
    ...over,
  }
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('isUnread', () => {
  it('holds an answer the caller has not seen', () => {
    expect(isUnread(view(), 'me', { since, seen: {} })).toBe(true)
    expect(isUnread(view(), 'me', { since, seen: { c1: '2026-09-20T10:05:00Z' } })).toBe(false)
    expect(isUnread(view(), 'me', { since, seen: { c1: '2026-09-20T10:00:00Z' } })).toBe(true)
  })

  it('is nothing the caller wrote last, nor anyone else’s conversation', () => {
    expect(isUnread(view({ last_author_member_id: 'me' }), 'me', { since, seen: {} })).toBe(false)
    expect(isUnread(view({ last_author_member_id: null }), 'me', { since, seen: {} })).toBe(false)
    expect(isUnread(view(), 'staff', { since, seen: {} })).toBe(false)
    expect(isUnread(view(), null, { since, seen: {} })).toBe(false)
  })

  it('counts nothing from before this browser kept track', () => {
    expect(isUnread(view(), 'me', { since: '2026-09-21T00:00:00Z', seen: {} })).toBe(false)
  })
})

describe('awaitsAnswer', () => {
  it('is a conversation of the caller’s that waits for an answer, or for one to be approved', () => {
    expect(awaitsAnswer(view({ state: 'awaiting_answer' }), 'me')).toBe(true)
    expect(awaitsAnswer(view({ state: 'reply_pending_approval' }), 'me')).toBe(true)
    expect(awaitsAnswer(view({ state: 'answered' }), 'me')).toBe(false)
    expect(awaitsAnswer(view({ state: 'awaiting_answer', status: 'closed' }), 'me')).toBe(false)
    expect(awaitsAnswer(view({ state: 'awaiting_answer' }), 'staff')).toBe(false)
  })
})

describe('what is kept for the caller', () => {
  it('starts afresh, from now, and keeps what is saved under their id alone', () => {
    const now = Date.parse('2026-09-26T12:00:00Z')
    expect(loadMemory('ada', now)).toEqual(freshMemory(now))
    const m = { since, seen: { c1: '2026-09-20T10:05:00Z' }, pending: { c2: 'k1' }, course: 'k1' }
    saveMemory('ada', m)
    expect(loadMemory('ada', now)).toEqual(m)
    expect(loadMemory('bo', now)).toEqual(freshMemory(now))
  })

  it('forgets the oldest it has seen, and the oldest it watches, past their limits', () => {
    const seen = Object.fromEntries(
      Array.from({ length: SEEN_MAX + 5 }, (_, i) => [
        `c${i}`,
        new Date(Date.UTC(2026, 8, 1) + i * 60_000).toISOString(),
      ]),
    )
    const pending = Object.fromEntries(Array.from({ length: PENDING_MAX + 3 }, (_, i) => [`p${i}`, 'k1']))
    saveMemory('ada', { since, seen, pending, course: null })
    const back = loadMemory('ada')
    expect(Object.keys(back.seen)).toHaveLength(SEEN_MAX)
    expect(back.seen.c0).toBeUndefined()
    expect(back.seen[`c${SEEN_MAX + 4}`]).toBeDefined()
    expect(Object.keys(back.pending)).toHaveLength(PENDING_MAX)
    expect(back.pending.p0).toBeUndefined()
  })

  it('starts afresh from anything unreadable, and does without storage', () => {
    localStorage.setItem('aishiteru.chat.ada', '[1,2]')
    expect(loadMemory('ada', 0).seen).toEqual({})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    expect(() => saveMemory('ada', freshMemory())).not.toThrow()
  })
})
