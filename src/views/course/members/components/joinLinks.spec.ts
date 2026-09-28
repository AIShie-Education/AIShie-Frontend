import { describe, expect, it } from 'vitest'
import { compareJoinLinks, draftArgs, joinLinkStatus, newDraft } from './joinLinks'

const NOW = Date.parse('2026-09-28T10:00:00Z')
const link = (over: Record<string, unknown> = {}) => ({
  expires_at: '2026-09-28T10:05:00Z',
  uses: 0,
  ...over,
})

describe('joinLinkStatus', () => {
  it('takes Core’s word for a link it has stopped for good', () => {
    expect(joinLinkStatus(link({ status: 'revoked' }), NOW)).toBe('revoked')
    expect(joinLinkStatus(link({ status: 'used_up' }), NOW)).toBe('used_up')
    expect(joinLinkStatus(link({ status: 'expired' }), NOW)).toBe('expired')
  })

  it('lets a link Core called live expire when its ten minutes are up, as the list is watched', () => {
    const l = link({ status: 'live', expires_at: '2026-09-28T10:05:00Z' })
    expect(joinLinkStatus(l, NOW)).toBe('live')
    expect(joinLinkStatus(l, Date.parse('2026-09-28T10:04:59.999Z'))).toBe('live')
    expect(joinLinkStatus(l, Date.parse('2026-09-28T10:05:00Z'))).toBe('expired')
  })

  it('works a state out as Core does without its word: revoked, then used up, then expired', () => {
    expect(joinLinkStatus(link({ revoked_at: '2026-09-28T09:59:00Z', uses: 3, max_uses: 3 }), NOW)).toBe('revoked')
    expect(joinLinkStatus(link({ uses: 3, max_uses: 3, expires_at: '2026-09-28T09:00:00Z' }), NOW)).toBe('used_up')
    expect(joinLinkStatus(link({ uses: 2, max_uses: 3 }), NOW)).toBe('live')
    expect(joinLinkStatus(link({ expires_at: '2026-09-28T09:59:59Z' }), NOW)).toBe('expired')
    expect(joinLinkStatus(link({ status: 'something_new' }), NOW)).toBe('live')
  })
})

describe('compareJoinLinks', () => {
  it('puts working links first, newest first, then the rest, newest first', () => {
    const rows = [
      { id: 'old-live', status: 'live' as const, created_at: '2026-09-28T09:51:00Z' },
      { id: 'new-ended', status: 'expired' as const, created_at: '2026-09-28T09:59:00Z' },
      { id: 'new-live', status: 'live' as const, created_at: '2026-09-28T09:58:00Z' },
      { id: 'old-ended', status: 'revoked' as const, created_at: '2026-09-28T08:00:00Z' },
    ]
    expect(rows.sort(compareJoinLinks).map((r) => r.id)).toEqual(['new-live', 'old-live', 'new-ended', 'old-ended'])
  })
})

describe('draftArgs', () => {
  it('asks for nothing but the course when nothing is set: no limit, any email, and Core’s ten minutes', () => {
    expect(draftArgs(newDraft())).toEqual({})
    expect(draftArgs({ maxUses: null, domains: [] })).toEqual({})
  })

  it('sends a limit and domains when there are any, the domains as a copy', () => {
    const d = { maxUses: 40, domains: ['hainanu.edu.cn', 'example.edu'] }
    const args = draftArgs(d)
    expect(args).toEqual({ max_uses: 40, allowed_email_domains: ['hainanu.edu.cn', 'example.edu'] })
    expect(args.allowed_email_domains).not.toBe(d.domains)
    expect('expires_at' in args).toBe(false)
  })
})
