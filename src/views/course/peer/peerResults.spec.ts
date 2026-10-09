import { describe, expect, it } from 'vitest'
import {
  applyPreview,
  averageShare,
  aloneInCircle,
  flaggedGroup,
  flagsOf,
  missingIn,
  peerCsv,
  peerRaters,
  ratedSelf,
  type PeerCsvWords,
} from './peerResults'
import type { PeerResults } from './peer'

// As Core answered for a group of three on a share form at 20 %, graded 80 of 100.
function results(over: { weight?: number; enabled?: boolean } = {}): PeerResults {
  return {
    form: {
      assignment_id: 'a1',
      enabled: over.enabled ?? true,
      kind: 'share',
      self_evaluation: false,
      opens: 'at',
      opens_at: '2026-10-05T10:00:00Z',
      closes_at: '2026-10-05T12:00:00Z',
      weight: over.weight ?? 20,
      share_with_students: 'own_average',
      version: 2,
      in_use: true,
      visible_to: ['graders', 'action_record'],
      students_see: ['own_sheet', 'own_average', 'own_adjustment'],
      updated_at: '2026-10-05T12:00:00Z',
    },
    groups: [
      {
        group_id: 'g1',
        name: 'Alpha',
        submission_id: 's1',
        window: { state: 'closed', opens: 'at', opens_at: '2026-10-05T10:00:00Z', closes_at: '2026-10-05T12:00:00Z' },
        group_score: 80,
        points_possible: 100,
        flags: [],
        members: [
          {
            member_id: 'm-ken',
            display_name: 'Ken Wong',
            submitted: true,
            submitted_at: '2026-10-05T11:00:00Z',
            rated_by: ['m-yuki', 'm-mei'],
            shares: [
              { rater_member_id: 'm-yuki', share: 60 },
              { rater_member_id: 'm-mei', share: 30 },
            ],
            factor: 0.9,
            peer_factor: 0.9,
            score: 78.4,
            grade: { grade_id: 'gr-ken', score: 80, state: 'draft' },
            flags: ['uniform'],
          },
          {
            member_id: 'm-mei',
            display_name: 'Mei Chan',
            submitted: false,
            rated_by: ['m-yuki', 'm-ken'],
            shares: [
              { rater_member_id: 'm-yuki', share: 40 },
              { rater_member_id: 'm-ken', share: 50 },
            ],
            factor: 0.9,
            score: 78.4,
            grade: { grade_id: 'gr-mei', score: 75, state: 'posted', adjustment_kind: 'replace' },
            flags: ['missing'],
          },
          {
            member_id: 'm-yuki',
            display_name: '=Yuki',
            submitted: true,
            submitted_at: '2026-10-05T11:30:00Z',
            rated_by: ['m-ken', 'm-mei'],
            shares: [
              { rater_member_id: 'm-ken', share: 50 },
              { rater_member_id: 'm-mei', share: 70 },
            ],
            factor: 1.2,
            score: 83.2,
            grade: { grade_id: 'gr-yuki', score: 80, state: 'posted' },
            flags: null,
          },
        ],
        sheets: [],
      },
      {
        group_id: 'g2',
        name: 'Beta',
        window: { state: 'closed', opens: 'at', closes_at: '2026-10-05T12:00:00Z' },
        points_possible: 100,
        flags: ['pair_without_self_evaluation'],
        members: [
          { member_id: 'm-ana', display_name: 'Ana', submitted: true, rated_by: ['m-bo'], factor: 1, flags: [] },
          { member_id: 'm-bo', display_name: 'Bo', submitted: true, rated_by: ['m-ana'], factor: 1, flags: [] },
        ],
        sheets: [],
      },
    ],
  } as PeerResults
}

describe('what counting peer evaluation would write', () => {
  it('moves each graded member’s score, leaves a grader’s own adjustment, and counts the ungraded later', () => {
    const rows = applyPreview(results())
    expect(rows.map((r) => [r.memberId, r.before, r.after, r.outcome, r.posted])).toEqual([
      ['m-ken', 80, 78.4, 'changes', false],
      ['m-mei', 75, 75, 'kept', true],
      ['m-yuki', 80, 83.2, 'changes', true],
      ['m-ana', null, null, 'ungraded', false],
      ['m-bo', null, null, 'ungraded', false],
    ])
  })

  it('takes peer adjustments away, back to the group’s score, once the form no longer counts', () => {
    const r = results({ weight: 0 })
    r.groups![0].members![2].grade = { grade_id: 'gr-yuki', score: 83.2, state: 'posted', adjustment_kind: 'peer' }
    const rows = applyPreview(r)
    expect(rows.find((x) => x.memberId === 'm-yuki')).toMatchObject({ before: 83.2, after: 80, outcome: 'changes' })
    expect(rows.find((x) => x.memberId === 'm-ken')).toMatchObject({ outcome: 'same' })
  })
})

describe('reading the results', () => {
  it('finds who has written nothing, and the groups with flags', () => {
    const r = results()
    expect(missingIn(r.groups![0], r.form).map((m) => m.member_id)).toEqual(['m-mei'])
    expect(flaggedGroup(r.groups![0], r.form)).toBe(true)
    expect(flaggedGroup(r.groups![1], r.form)).toBe(true)
    expect(peerRaters({ member_id: 'm-a', rated_by: ['m-a', 'm-b', 'm-c'] })).toBe(2)
    expect(
      averageShare({
        shares: [
          { rater_member_id: 'x', share: 60 },
          { rater_member_id: 'y', share: 35 },
        ],
      }),
    ).toBe(47.5)
    expect(averageShare({ shares: null })).toBeNull()
  })

  // Core gives a member alone in their group a task naming nobody, takes no sheet of nobody, and flags them missing.
  const alone = {
    group_id: 'g3',
    name: 'Gamma',
    window: { state: 'closed', opens: 'at', closes_at: '2026-10-05T12:00:00Z' },
    points_possible: 100,
    flags: [],
    members: [{ member_id: 'm-lin', display_name: 'Lin', submitted: false, factor: 1, flags: ['missing'] }],
    sheets: [],
  } as unknown as NonNullable<PeerResults['groups']>[number]

  it('counts nobody alone in their group, self-evaluation off, as missing an evaluation, nor flags them', () => {
    const r = results()
    expect(aloneInCircle(alone, r.form)).toBe(true)
    expect(missingIn(alone, r.form)).toEqual([])
    expect(flaggedGroup(alone, r.form)).toBe(false)
    expect(flagsOf(alone.members![0]!, true)).toEqual([])
    expect(flagsOf(alone.members![0]!)).toEqual(['missing'])
    // A group of two is not alone, and one with self-evaluation on evaluates themselves.
    expect(aloneInCircle(r.groups![1]!, r.form)).toBe(false)
    expect(aloneInCircle(alone, { self_evaluation: true })).toBe(false)
    expect(missingIn(alone, { self_evaluation: true }).map((m) => m.member_id)).toEqual(['m-lin'])
  })
})

describe('the results as CSV', () => {
  const words: PeerCsvWords = {
    group: 'Group',
    member: 'Member',
    wrote: 'Wrote',
    wroteAt: 'Written at',
    raters: 'Raters',
    averageShare: 'Average share',
    criterion: (l) => `${l} avg`,
    self: 'Self',
    factor: 'Factor',
    factorSelf: 'Factor with self',
    peerFactor: 'Peer factor',
    score: 'Score at 20%',
    groupScore: 'Group score',
    grade: 'Grade',
    flags: 'Flags',
    yes: 'Yes',
    no: 'No',
    alone: 'Nobody to evaluate',
    flag: (f) => f.toUpperCase(),
    list: (items) => items.join(' and '),
    gradeNow: (score, state, own) => (own ? `${score} own` : state === 'draft' ? `${score} draft` : score),
  }

  it('is a row a member, with a byte-order mark and CRLF lines, and no cell run as a formula', () => {
    const csv = peerCsv(results(), words)
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe(
      'Group,Member,Wrote,Written at,Raters,Average share,Factor,Score at 20%,Group score,Grade,Flags',
    )
    expect(lines[1]).toBe('Alpha,Ken Wong,Yes,2026-10-05T11:00:00Z,2,45,0.9,78.4,80,80 draft,UNIFORM')
    expect(lines[2]).toBe('Alpha,Mei Chan,No,,2,45,0.9,78.4,80,75 own,MISSING')
    // A name a spreadsheet would run is written after an apostrophe.
    expect(lines[3]).toBe("Alpha,'=Yuki,Yes,2026-10-05T11:30:00Z,2,60,1.2,83.2,80,80,")
    expect(lines[4]).toBe('Beta,Ana,Yes,,1,,1,,,,')
    expect(lines.at(-1)).toBe('')
  })

  it('says, with self-evaluation on, that the factor counts what they gave themselves, beside the factor from peers alone', () => {
    const csv = peerCsv(selfResults(), words)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe(
      'Group,Member,Wrote,Written at,Raters,Average share,Self,Factor with self,Peer factor,Score at 20%,Group score,Grade,Flags',
    )
    // Rated by herself alone: no peer, her factor 1.5, none from peers.
    expect(lines[1]).toBe('Alpha,Amy,Yes,2026-10-05T11:00:00Z,0,,1.5,1.5,,100,80,80 draft,HIGH')
    // Rated by Amy alone, who gave her a quarter.
    expect(lines[2]).toBe('Alpha,Bo,No,,1,25,,0.75,0.75,70,80,80 draft,LOW and MISSING')
  })

  it('leaves the score out on a form for reference only, where it is the group’s', () => {
    const lines = peerCsv(results({ weight: 0 }), words).slice(1).split('\r\n')
    expect(lines[0]).toBe('Group,Member,Wrote,Written at,Raters,Average share,Factor,Group score,Grade,Flags')
    expect(lines[1]).toBe('Alpha,Ken Wong,Yes,2026-10-05T11:00:00Z,2,45,0.9,80,80 draft,UNIFORM')
  })

  it('says a member alone in their group had nobody to evaluate, never that they wrote nothing', () => {
    const r = results()
    r.groups = [
      {
        ...r.groups![1]!,
        name: 'Gamma',
        flags: [],
        members: [{ member_id: 'm-lin', display_name: 'Lin', submitted: false, rated_by: [], factor: 1, flags: ['missing'] }],
      },
    ]
    const lines = peerCsv(r, words).slice(1).split('\r\n')
    expect(lines[1]).toBe('Gamma,Lin,Nobody to evaluate,,0,,1,,,,')
  })
})

// As Core b5d6b43 answered for a share form with self-evaluation on, at 50 %,
// where only Amy wrote an evaluation (herself 50, Bo 25, Cy 25), the group
// graded 80: her factor counts her own share, rated_by naming her alone.
function selfResults(): PeerResults {
  const r = results({ weight: 50 })
  r.form.self_evaluation = true
  r.groups = [
    {
      ...r.groups![0],
      members: [
        {
          member_id: 'm-amy',
          display_name: 'Amy',
          submitted: true,
          submitted_at: '2026-10-05T11:00:00Z',
          rated_by: ['m-amy'],
          self: { student_member_id: 'm-amy', share: 50 },
          factor: '1.5',
          self_factor: '1.5',
          score: '100',
          grade: { grade_id: 'gr-amy', score: 80, state: 'draft' },
          flags: ['high'],
        },
        {
          member_id: 'm-bo',
          display_name: 'Bo',
          submitted: false,
          rated_by: ['m-amy'],
          shares: [{ rater_member_id: 'm-amy', share: 25 }],
          factor: '0.75',
          peer_factor: '0.75',
          score: '70',
          grade: { grade_id: 'gr-bo', score: 80, state: 'draft' },
          flags: ['low', 'missing'],
        },
      ],
    },
  ]
  return r
}

describe('a member’s own evaluation in their factor', () => {
  it('is in it where they rated themselves', () => {
    const [amy, bo] = selfResults().groups![0].members!
    expect(ratedSelf(amy)).toBe(true)
    expect(peerRaters(amy)).toBe(0)
    expect(ratedSelf(bo)).toBe(false)
    expect(peerRaters(bo)).toBe(1)
  })
})
