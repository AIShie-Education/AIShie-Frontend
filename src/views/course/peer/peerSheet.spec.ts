import { describe, expect, it } from 'vitest'
import {
  evaluatedIn,
  evenShares,
  parseShare,
  sameAsSheet,
  shareTotal,
  sheetFrom,
  sheetProblems,
  submitArgs,
} from './peerSheet'
import type { FormLike, PeerTask } from './peer'

const share: FormLike = {
  kind: 'share',
  self_evaluation: false,
  opens: 'on_hand_in',
  closes_at: '2026-10-20T00:00:00Z',
  weight: 20,
}
const rating: FormLike = {
  ...share,
  kind: 'rating',
  criteria: [
    { key: 'contribution', label: 'Contribution' },
    { key: 'teamwork', label: 'Teamwork' },
  ],
  scale_min: 1,
  scale_max: 5,
  self_evaluation: true,
}

function task(over: Partial<PeerTask> = {}): PeerTask {
  return {
    group_id: 'g1',
    group_name: 'Alpha',
    // The circle as Core lists it, by name.
    circle: [
      { member_id: 'm-ken', display_name: 'Ken' },
      { member_id: 'm-mei', display_name: 'Mei' },
      { member_id: 'm-yuki', display_name: 'Yuki' },
    ],
    to_evaluate: ['m-mei', 'm-ken'],
    window: { state: 'open', opens: 'on_hand_in', closes_at: '2026-10-20T00:00:00Z' },
    ...over,
  }
}

describe('whom a sheet covers', () => {
  it('is whom Core says, in the circle’s order, the student last where they evaluate themselves', () => {
    expect(evaluatedIn(task(), 'm-yuki')).toEqual(['m-ken', 'm-mei'])
    expect(evaluatedIn(task({ to_evaluate: ['m-yuki', 'm-ken', 'm-mei'] }), 'm-yuki')).toEqual([
      'm-ken',
      'm-mei',
      'm-yuki',
    ])
  })
})

describe('a share sheet', () => {
  it('starts empty, and from the sheet written where there is one', () => {
    expect(sheetFrom(share, task(), 'm-yuki')).toEqual({
      comment: '',
      entries: [
        { memberId: 'm-ken', share: '', ratings: {}, comment: '' },
        { memberId: 'm-mei', share: '', ratings: {}, comment: '' },
      ],
    })
    const written = task({
      sheet: {
        review_id: 'r1',
        rater_member_id: 'm-yuki',
        group_id: 'g1',
        submitted_at: '2026-10-06T00:00:00Z',
        comment: 'Good work',
        entries: [
          { student_member_id: 'm-ken', share: 60, comment: 'Did most' },
          { student_member_id: 'm-mei', share: 40 },
        ],
      },
    })
    const d = sheetFrom(share, written, 'm-yuki')
    expect(d.entries.map((e) => e.share)).toEqual(['60', '40'])
    expect(d.entries[0].comment).toBe('Did most')
    expect(d.comment).toBe('Good work')
    expect(sameAsSheet(share, written.sheet, d)).toBe(true)
    d.entries[0].share = '55'
    expect(sameAsSheet(share, written.sheet, d)).toBe(false)
  })

  it('must add up to exactly 100, in whole numbers from 0 to 100', () => {
    const d = sheetFrom(share, task(), 'm-yuki')
    expect(sheetProblems(share, d).map((p) => p.kind)).toEqual(['shareMissing', 'shareMissing'])
    d.entries[0].share = '60'
    d.entries[1].share = '30'
    expect(shareTotal(d)).toBe(90)
    expect(sheetProblems(share, d)).toEqual([{ kind: 'shareTotal', total: 90 }])
    d.entries[1].share = '40'
    expect(sheetProblems(share, d)).toEqual([])
    d.entries[1].share = '40.5'
    expect(sheetProblems(share, d)).toEqual([{ kind: 'shareInvalid', memberId: 'm-mei' }])
    expect(parseShare('101')).toBeNull()
    expect(parseShare(' 7 ')).toBe(7)
    expect(parseShare('-1')).toBeNull()
  })

  it('splits 100 as evenly as whole numbers allow', () => {
    expect(evenShares(3)).toEqual([34, 33, 33])
    expect(evenShares(4)).toEqual([25, 25, 25, 25])
    expect(evenShares(7).reduce((a, b) => a + b, 0)).toBe(100)
    expect(evenShares(0)).toEqual([])
  })

  it('is sent as shares, with the comments written and none for those left empty', () => {
    const d = sheetFrom(share, task(), 'm-yuki')
    d.entries[0].share = '60'
    d.entries[0].comment = '  Did most  '
    d.entries[1].share = '40'
    expect(submitArgs('c1', 'a1', share, d)).toEqual({
      course_id: 'c1',
      assignment_id: 'a1',
      comment: undefined,
      entries: [
        { student_member_id: 'm-ken', share: 60, comment: 'Did most' },
        { student_member_id: 'm-mei', share: 40 },
      ],
    })
  })
})

describe('a rating sheet', () => {
  const t3 = task({ to_evaluate: ['m-ken', 'm-mei', 'm-yuki'] })

  it('rates every member, the student too where the form says so, on every criterion', () => {
    const d = sheetFrom(rating, t3, 'm-yuki')
    expect(d.entries.map((e) => e.memberId)).toEqual(['m-ken', 'm-mei', 'm-yuki'])
    expect(sheetProblems(rating, d)).toHaveLength(6)
    for (const e of d.entries) {
      e.ratings.contribution = 4
      e.ratings.teamwork = 5
    }
    expect(sheetProblems(rating, d)).toEqual([])
    d.entries[2].ratings.teamwork = 6
    expect(sheetProblems(rating, d)).toEqual([{ kind: 'ratingMissing', memberId: 'm-yuki', criterion: 'teamwork' }])
  })

  it('is sent as ratings by criterion', () => {
    const d = sheetFrom(rating, t3, 'm-yuki')
    d.entries.forEach((e, i) => {
      e.ratings.contribution = i + 1
      e.ratings.teamwork = 3
    })
    d.comment = 'We worked well'
    expect(submitArgs('c1', 'a1', rating, d)).toEqual({
      course_id: 'c1',
      assignment_id: 'a1',
      comment: 'We worked well',
      entries: [
        { student_member_id: 'm-ken', ratings: { contribution: 1, teamwork: 3 } },
        { student_member_id: 'm-mei', ratings: { contribution: 2, teamwork: 3 } },
        { student_member_id: 'm-yuki', ratings: { contribution: 3, teamwork: 3 } },
      ],
    })
  })

  it('flags a comment too long', () => {
    const d = sheetFrom(rating, t3, 'm-yuki')
    d.comment = 'x'.repeat(2001)
    expect(sheetProblems(rating, d).some((p) => p.kind === 'commentTooLong')).toBe(true)
  })
})
