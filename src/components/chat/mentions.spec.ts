import { beforeEach, describe, expect, it, vi } from 'vitest'

const reads: { tool: string; args: Record<string, unknown> }[] = []
vi.mock('@/api/http', () => ({
  read: vi.fn(async (tool: string, args: Record<string, unknown>) => {
    reads.push({ tool, args })
    if (tool === 'assignment.list') return { assignments: [{ id: 'a1', title: 'HW1 — Temperature converter' }] }
    if (tool === 'document.list')
      return {
        documents: [
          { id: 'd2', title: 'Week 2 notes', sort_order: 2 },
          { id: 'd1', title: 'Week 1 notes', sort_order: 1 },
        ],
      }
    throw new Error(tool)
  }),
}))

const { courseMentions, forgetMentions, matchMentions, MENTIONS_TTL_MS, triggerAt } = await import('./mentions')

beforeEach(() => {
  reads.length = 0
  forgetMentions()
})

describe('courseMentions', () => {
  it('reads the course’s assignments and materials, as the caller may, once a minute at most', async () => {
    const items = await courseMentions('k1', 1000)
    expect(items).toEqual([
      { kind: 'assignment', id: 'a1', title: 'HW1 — Temperature converter' },
      { kind: 'material', id: 'd1', title: 'Week 1 notes' },
      { kind: 'material', id: 'd2', title: 'Week 2 notes' },
    ])
    expect(reads).toEqual([
      { tool: 'assignment.list', args: { course_id: 'k1', limit: 200 } },
      { tool: 'document.list', args: { course_id: 'k1', kind: 'material', limit: 200 } },
    ])
    await courseMentions('k1', 1000 + MENTIONS_TTL_MS - 1)
    expect(reads).toHaveLength(2)
    await courseMentions('k1', 1000 + MENTIONS_TTL_MS)
    expect(reads).toHaveLength(4)
  })
})

describe('matchMentions', () => {
  const items = [
    { kind: 'material' as const, id: 'd1', title: 'Week 1: HW tips' },
    { kind: 'assignment' as const, id: 'a1', title: 'HW1 — Temperature converter' },
  ]
  it('matches the title anywhere, any case, those that begin with it first', () => {
    expect(matchMentions(items, 'hw').map((m) => m.id)).toEqual(['a1', 'd1'])
    expect(matchMentions(items, 'TEMP').map((m) => m.id)).toEqual(['a1'])
    expect(matchMentions(items, '').map((m) => m.id)).toEqual(['d1', 'a1'])
    expect(matchMentions(items, 'nothing')).toEqual([])
  })
})

describe('triggerAt', () => {
  it('opens the commands while the whole text is a slash and a word', () => {
    expect(triggerAt('/', 1)).toEqual({ kind: 'slash', query: '' })
    expect(triggerAt('/his', 4)).toEqual({ kind: 'slash', query: 'his' })
    expect(triggerAt('／new', 4)).toEqual({ kind: 'slash', query: 'new' })
    expect(triggerAt('/new ', 5)).toBeNull()
    expect(triggerAt('see /etc', 8)).toBeNull()
  })

  it('opens the mentions at an @ that begins a word, up to the caret', () => {
    expect(triggerAt('@', 1)).toEqual({ kind: 'mention', start: 0, query: '' })
    expect(triggerAt('about @HW1', 10)).toEqual({ kind: 'mention', start: 6, query: 'HW1' })
    expect(triggerAt('關於 ＠作業', 6)).toEqual({ kind: 'mention', start: 3, query: '作業' })
    // An email, a finished word, or the caret elsewhere: none.
    expect(triggerAt('mail a@b.com', 12)).toBeNull()
    expect(triggerAt('@HW1 is due', 11)).toBeNull()
    expect(triggerAt('@HW1 is due', 4)).toEqual({ kind: 'mention', start: 0, query: 'HW1' })
  })
})
