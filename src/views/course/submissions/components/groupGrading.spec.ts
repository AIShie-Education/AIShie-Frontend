import { describe, expect, it } from 'vitest'
import type { GradeSummary } from '@/api/types'
import {
  adjustmentsArg,
  anyAbove,
  isGraderAdjustment,
  liveByMember,
  memberLines,
  memberScore,
  rowFrom,
  rowProblem,
  rowsFor,
  sameRows,
  workMemberIds,
  workReach,
  type AdjustRow,
} from './groupGrading'

const row = (over: Partial<AdjustRow>): AdjustRow => ({
  memberId: 'm1',
  kind: 'none',
  points: '',
  reason: '',
  peer: null,
  ...over,
})

function grade(over: Partial<GradeSummary>): GradeSummary {
  return {
    id: 'g',
    student_member_id: 'm1',
    submission_id: 's1',
    assignment_id: 'a1',
    origin: 'entered',
    score: 80,
    state: 'draft',
    grader_member_id: 't',
    created_by_action_id: 'act',
    created_at: '2026-10-05T10:00:00+08:00',
    ...over,
  } as GradeSummary
}

describe('a member’s line, from their grade', () => {
  it('carries a grader’s adjustment, with its reason', () => {
    expect(rowFrom('m1', { kind: 'delta', points: -10, reason: 'Missed two meetings', by_member_id: 't' })).toEqual({
      memberId: 'm1',
      kind: 'delta',
      points: '-10',
      reason: 'Missed two meetings',
      peer: null,
    })
    expect(rowFrom('m1', { kind: 'replace', points: '90', reason: 'Wrote it' }).kind).toBe('replace')
  })

  it('takes peer evaluation’s for none, keeping it to show', () => {
    const peer = { kind: 'peer', points: '3.2', detail: { factor: '1.2', weight: 20 } }
    expect(rowFrom('m1', peer)).toEqual({ memberId: 'm1', kind: 'none', points: '', reason: '', peer })
    expect(isGraderAdjustment(peer)).toBe(false)
  })

  it('is none without an adjustment', () => {
    expect(rowFrom('m1', null).kind).toBe('none')
    expect(rowFrom('m1', undefined).kind).toBe('none')
  })
})

describe('each member’s live grade on the work', () => {
  it('is their draft, else their posted grade; never one superseded, or on other work', () => {
    const grades = [
      grade({ id: 'old', student_member_id: 'm1', state: 'superseded', superseded_by: 'new' }),
      grade({ id: 'posted', student_member_id: 'm1', state: 'posted' }),
      grade({ id: 'draft', student_member_id: 'm2', state: 'draft' }),
      grade({ id: 'p2', student_member_id: 'm2', state: 'posted' }),
      grade({ id: 'elsewhere', student_member_id: 'm3', submission_id: 's2' }),
    ]
    const live = liveByMember(grades, 's1')
    expect(live.get('m1')?.id).toBe('posted')
    expect(live.get('m2')?.id).toBe('draft')
    expect(live.has('m3')).toBe(false)
  })

  it('is the newer of two of the same state', () => {
    const live = liveByMember(
      [
        grade({ id: 'a', created_at: '2026-10-05T10:00:00+08:00' }),
        grade({ id: 'b', created_at: '2026-10-05T03:00:00Z' }),
      ],
      's1',
    )
    expect(live.get('m1')?.id).toBe('b')
  })

  it('gives every member of the work a line, as their grade has it', () => {
    const live = liveByMember(
      [
        grade({
          student_member_id: 'm2',
          group: { group_grade_id: 'gg', score: 80, adjustment: { kind: 'delta', points: -5, reason: 'r' } },
        }),
      ],
      's1',
    )
    const rows = rowsFor(workMemberIds({ members: [{ member_id: 'm1' }, { member_id: 'm2' }] }), live, () => true)
    expect(rows.map((r) => [r.memberId, r.kind, r.points, !!r.unseen])).toEqual([
      ['m1', 'none', '', false],
      ['m2', 'delta', '-5', false],
    ])
  })
})

describe('the lines where the work’s grades are not known', () => {
  it('keeps every member’s as their grade has it, unseen: nothing to check, no score to show', () => {
    const rows = rowsFor(['m1', 'm2'], null, () => true)
    expect(rows.map((r) => [r.memberId, r.kind, r.unseen])).toEqual([
      ['m1', 'keep', true],
      ['m2', 'keep', true],
    ])
    expect(memberScore('80', rows[0])).toBeNull()
    expect(rowProblem(rows[0], '80', 100, false)).toBeNull()
    expect(anyAbove(rows, '80', 100)).toBe(false)
  })
})

describe('the lines where whom the seat reaches is not known', () => {
  // Cai's grade (70, the group's 80 minus 10) was not given to a seat that may not reach him.
  const live = liveByMember(
    [
      grade({ student_member_id: 'ana' }),
      grade({
        student_member_id: 'ben',
        group: { group_grade_id: 'gg', score: 80, adjustment: { kind: 'delta', points: 5, reason: 'r' } },
      }),
    ],
    's1',
  )

  it('keeps a member with no grade shown as their grade has it, unseen, never as the group’s score', () => {
    const rows = rowsFor(['ana', 'ben', 'cai'], live, () => null)
    expect(rows.map((r) => [r.memberId, r.kind, r.points, !!r.unseen])).toEqual([
      ['ana', 'none', '', false],
      ['ben', 'delta', '5', false],
      ['cai', 'keep', '', true],
    ])
    expect(memberScore('80', rows[2])).toBeNull()
    // Nothing is said of Cai's: Core carries his.
    expect(adjustmentsArg(rows)).toEqual([
      { student_member_id: 'ana', kind: 'none' },
      { student_member_id: 'ben', kind: 'delta', points: '5', reason: 'r' },
    ])
  })

  it('keeps one known to be out of reach so too; one known to be reached, with no grade, has none', () => {
    const reaches = (id: string) => (id === 'cai' ? false : id === 'dev' ? true : null)
    expect(rowsFor(['cai', 'dev'], live, reaches).map((r) => [r.memberId, r.kind])).toEqual([
      ['cai', 'keep'],
      ['dev', 'none'],
    ])
  })
})

describe('a member’s score from the group’s', () => {
  it('is the group’s, their own, or the group’s plus or minus, exactly', () => {
    expect(memberScore('80', row({}))).toBe('80')
    expect(memberScore('80', row({ kind: 'replace', points: '90.50' }))).toBe('90.5')
    expect(memberScore('80', row({ kind: 'delta', points: '-10' }))).toBe('70')
    expect(memberScore('0.1', row({ kind: 'delta', points: '0.2' }))).toBe('0.3')
  })

  it('is not known while what it needs is not a number', () => {
    expect(memberScore('', row({}))).toBeNull()
    expect(memberScore('', row({ kind: 'delta', points: '5' }))).toBeNull()
    expect(memberScore('80', row({ kind: 'delta', points: 'five' }))).toBeNull()
    // A score of their own does not need the group's.
    expect(memberScore('', row({ kind: 'replace', points: '7' }))).toBe('7')
  })
})

describe('what is wrong with a line', () => {
  it('is nothing for the group’s score', () => {
    expect(rowProblem(row({}), '', 100, false)).toBeNull()
  })

  it('wants points that are a number, a score of their own not below zero, and a reason', () => {
    expect(rowProblem(row({ kind: 'delta' }), '80', 100, false)).toBe('points')
    expect(rowProblem(row({ kind: 'replace', points: '-1', reason: 'x' }), '80', 100, false)).toBe('negative')
    expect(rowProblem(row({ kind: 'delta', points: '-10', reason: '  ' }), '80', 100, false)).toBe('reason')
    expect(rowProblem(row({ kind: 'delta', points: '-10', reason: 'x'.repeat(501) }), '80', 100, false)).toBe(
      'reasonLong',
    )
    expect(rowProblem(row({ kind: 'delta', points: '-10', reason: 'x'.repeat(500) }), '80', 100, false)).toBeNull()
  })

  it('refuses a score that comes to below zero, or above the points possible unless extra is allowed', () => {
    expect(rowProblem(row({ kind: 'delta', points: '-90', reason: 'x' }), '80', 100, false)).toBe('belowZero')
    expect(rowProblem(row({ kind: 'delta', points: '25', reason: 'x' }), '80', 100, false)).toBe('abovePoints')
    expect(rowProblem(row({ kind: 'delta', points: '25', reason: 'x' }), '80', 100, true)).toBeNull()
    expect(anyAbove([row({}), row({ kind: 'replace', points: '101', reason: 'x' })], '80', 100)).toBe(true)
    expect(anyAbove([row({ kind: 'delta', points: '20' })], '80', 100)).toBe(false)
  })
})

describe('what is written', () => {
  it('is every member’s line, none where it has none, trimmed', () => {
    expect(
      adjustmentsArg([
        row({ memberId: 'm1' }),
        row({ memberId: 'm2', kind: 'delta', points: ' -10 ', reason: ' Missed two meetings ' }),
        row({ memberId: 'm3', kind: 'none', points: '5', reason: 'left from before' }),
      ]),
    ).toEqual([
      { student_member_id: 'm1', kind: 'none' },
      { student_member_id: 'm2', kind: 'delta', points: '-10', reason: 'Missed two meetings' },
      { student_member_id: 'm3', kind: 'none' },
    ])
  })

  it('leaves out a line kept as the member’s grade has it, unseen, for Core to carry', () => {
    expect(
      adjustmentsArg([
        row({ memberId: 'm1', kind: 'keep' }),
        row({ memberId: 'm2', kind: 'delta', points: '5', reason: 'Built the model' }),
        row({ memberId: 'm3', kind: 'none' }),
      ]),
    ).toEqual([
      { student_member_id: 'm2', kind: 'delta', points: '5', reason: 'Built the model' },
      { student_member_id: 'm3', kind: 'none' },
    ])
    // Every line kept: nothing is sent, and Core carries each member's.
    expect(adjustmentsArg([row({ memberId: 'm1', kind: 'keep' }), row({ memberId: 'm2', kind: 'keep' })])).toBe(
      undefined,
    )
  })

  it('is the same for lines that write the same', () => {
    expect(sameRows([row({ points: '5' })], [row({})])).toBe(true)
    expect(sameRows([row({ kind: 'delta', points: '5', reason: 'r' })], [row({})])).toBe(false)
  })
})

describe('whose work it is, against the group now', () => {
  const handedIn = '2026-10-05T12:00:00+08:00'
  it('marks who has left, who was never in the group, who joined since, and who is in it but not part', () => {
    const lines = memberLines({
      workMembers: ['ana', 'ben', 'fay'],
      groupId: 'gA',
      frozenAt: handedIn,
      groupNow: [
        { member_id: 'ana', joined_at: '2026-10-01T00:00:00Z' },
        { member_id: 'dan', joined_at: '2026-10-06T00:00:00Z' },
        { member_id: 'eli', joined_at: '2026-10-01T00:00:00Z' },
      ],
      history: [
        { member_id: 'ana', group_id: 'gA', joined_at: '2026-10-01T00:00:00Z' },
        {
          member_id: 'ben',
          group_id: 'gA',
          joined_at: '2026-10-01T00:00:00Z',
          left_at: '2026-10-07T00:00:00Z',
          left_how: 'moved',
        },
        { member_id: 'ben', group_id: 'gB', joined_at: '2026-10-07T00:00:00Z' },
        { member_id: 'dan', group_id: 'gA', joined_at: '2026-10-06T00:00:00Z' },
        { member_id: 'eli', group_id: 'gA', joined_at: '2026-10-01T00:00:00Z' },
      ],
    })
    expect(lines).toEqual([
      { memberId: 'ana', standing: 'work', at: null },
      { memberId: 'ben', standing: 'left', at: '2026-10-07T00:00:00Z' },
      { memberId: 'fay', standing: 'outside', at: null },
      { memberId: 'dan', standing: 'joinedSince', at: '2026-10-06T00:00:00Z' },
      { memberId: 'eli', standing: 'notPart', at: '2026-10-01T00:00:00Z' },
    ])
  })

  it('marks nobody where the group’s members cannot be read', () => {
    expect(memberLines({ workMembers: ['ana', 'ben'], groupId: 'gA', frozenAt: handedIn, groupNow: null })).toEqual([
      { memberId: 'ana', standing: 'work', at: null },
      { memberId: 'ben', standing: 'work', at: null },
    ])
  })

  it('marks a member the seat does not reach as such, never as out of the group, and one it may not reach not at all', () => {
    // Core leaves Cai out of the group's members and its history: the seat is listed for Ana and Ben.
    const reaches = (id: string) => (id === 'cai' ? false : id === 'dev' ? null : true)
    const lines = memberLines({
      workMembers: ['ana', 'ben', 'cai', 'dev'],
      groupId: 'gA',
      frozenAt: handedIn,
      groupNow: [{ member_id: 'ana', joined_at: '2026-10-01T00:00:00Z' }],
      history: [
        { member_id: 'ana', group_id: 'gA', joined_at: '2026-10-01T00:00:00Z' },
        {
          member_id: 'ben',
          group_id: 'gA',
          joined_at: '2026-10-01T00:00:00Z',
          left_at: '2026-10-07T00:00:00Z',
          left_how: 'moved',
        },
      ],
      reaches,
    })
    expect(lines).toEqual([
      { memberId: 'ana', standing: 'work', at: null },
      { memberId: 'ben', standing: 'left', at: '2026-10-07T00:00:00Z' },
      { memberId: 'cai', standing: 'unreached', at: null },
      { memberId: 'dev', standing: 'work', at: null },
    ])
  })

  it('takes one not in the group to have left it where there is no history', () => {
    const lines = memberLines({ workMembers: ['ben'], groupId: 'gA', frozenAt: handedIn, groupNow: [] })
    expect(lines).toEqual([{ memberId: 'ben', standing: 'left', at: null }])
  })
})

describe('whether the seat reaches every member of the work', () => {
  it('is all, some (one known not reached), or not known', () => {
    const by = (m: Record<string, boolean | null>) => (id: string) => m[id] ?? null
    expect(workReach(['ana', 'ben'], by({ ana: true, ben: true }))).toBe('all')
    expect(workReach(['ana', 'ben', 'cai'], by({ ana: true, ben: null, cai: false }))).toBe('some')
    expect(workReach(['ana', 'ben'], by({ ana: true, ben: null }))).toBe('unknown')
  })
})
