import { describe, expect, it } from 'vitest'
import {
  blankCriterion,
  draftFrom,
  formProblems,
  keyFor,
  newDraft,
  setArgs,
  shapeChanged,
  whoSees,
  withKeys,
  type PeerFormDraft,
} from './peerForm'
import { formCounts, peerScore, round2, type FormLike } from './peer'

const starters = [
  { key: 'contribution', label: 'Contribution', description: '', weight: '' },
  { key: 'teamwork', label: 'Teamwork', description: '', weight: '' },
]

const ratingForm: FormLike = {
  kind: 'rating',
  criteria: [
    { key: 'contribution', label: 'Contribution', weight: 2 },
    { key: 'teamwork', label: 'Teamwork', description: 'Talks to the group', weight: 1 },
  ],
  scale_min: 1,
  scale_max: 5,
  self_evaluation: true,
  opens: 'at',
  opens_at: '2026-10-01T00:00:00Z',
  closes_at: '2026-10-20T15:59:00Z',
  weight: 20,
  share_with_students: 'own_average',
  enabled: true,
  in_use: false,
}

describe('a new peer form', () => {
  it('splits 100 points, opens on hand-in, counts for reference only and closes a week after the due date', () => {
    const now = Date.parse('2026-10-05T04:00:00Z')
    const d = newDraft({ dueAt: '2026-10-10T15:59:00Z', now, starters })
    expect(d.kind).toBe('share')
    expect(d.opens).toBe('on_hand_in')
    expect(d.weight).toBe(0)
    expect(d.shareWithStudents).toBe('none')
    expect(d.selfEvaluation).toBe(false)
    expect(new Date(d.closesAt).getTime()).toBeGreaterThan(Date.parse('2026-10-16T00:00:00Z'))
    // A rating form's criteria start from the starters, ready if the teacher switches to it.
    expect(d.criteria.map((c) => c.key)).toEqual(['contribution', 'teamwork'])
  })

  it('closes two weeks from now where the due date has passed or there is none', () => {
    const now = Date.parse('2026-10-05T04:00:00Z')
    for (const dueAt of [null, '2026-09-01T00:00:00Z']) {
      const d = newDraft({ dueAt, now, starters })
      expect(new Date(d.closesAt).getTime()).toBeGreaterThan(Date.parse('2026-10-18T00:00:00Z'))
      expect(new Date(d.closesAt).getTime()).toBeLessThan(Date.parse('2026-10-20T00:00:00Z'))
    }
  })
})

describe('a form read, as a draft and back', () => {
  it('keeps every field, and sends it over the version read', () => {
    const d = draftFrom(ratingForm)
    expect(d).toMatchObject({
      kind: 'rating',
      scaleMin: 1,
      scaleMax: 5,
      selfEvaluation: true,
      opens: 'at',
      weight: 20,
      shareWithStudents: 'own_average',
      enabled: true,
    })
    expect(d.criteria[0]).toEqual({ key: 'contribution', label: 'Contribution', description: '', weight: '2' })
    const args = setArgs('c1', 'a1', d, 3)
    expect(args).toEqual({
      course_id: 'c1',
      assignment_id: 'a1',
      enabled: true,
      kind: 'rating',
      self_evaluation: true,
      opens: 'at',
      opens_at: '2026-10-01T00:00:00.000Z',
      closes_at: '2026-10-20T15:59:00.000Z',
      weight: 20,
      share_with_students: 'own_average',
      version: 3,
      criteria: [
        { key: 'contribution', label: 'Contribution', weight: '2' },
        { key: 'teamwork', label: 'Teamwork', description: 'Talks to the group', weight: '1' },
      ],
      scale_min: 1,
      scale_max: 5,
    })
    expect(shapeChanged(ratingForm, d)).toBe(false)
  })

  it('sends a share form without criteria, a scale or an opening time', () => {
    const d: PeerFormDraft = { ...draftFrom(ratingForm), kind: 'share', opens: 'on_hand_in' }
    const args = setArgs('c1', 'a1', d, 0)
    expect(args.criteria).toBeUndefined()
    expect(args.scale_min).toBeUndefined()
    expect(args.opens_at).toBeUndefined()
    expect(args.version).toBe(0)
  })

  it('says when what is evaluated changes, which an evaluation written fixes, and not for dates or weight', () => {
    const d = draftFrom(ratingForm)
    expect(shapeChanged(ratingForm, { ...d, weight: 50, closesAt: '2026-11-01T00:00:00Z' })).toBe(false)
    expect(shapeChanged(ratingForm, { ...d, scaleMax: 7 })).toBe(true)
    expect(shapeChanged(ratingForm, { ...d, selfEvaluation: false })).toBe(true)
    expect(shapeChanged(ratingForm, { ...d, criteria: [d.criteria[0]] })).toBe(true)
    // A weight left empty is 1, as Core keeps it.
    const unweighted = { ...d, criteria: d.criteria.map((c, i) => (i === 1 ? { ...c, weight: '' } : c)) }
    expect(shapeChanged(ratingForm, unweighted)).toBe(false)
  })
})

describe('criterion keys', () => {
  it('are made from Latin letters, and numbered where a label has none', () => {
    expect(keyFor('Contribution to the work', new Set())).toBe('contribution_to_the_work')
    expect(keyFor('對作業的貢獻', new Set())).toBe('c1')
    expect(keyFor('對作業的貢獻', new Set(['c1']))).toBe('c2')
    expect(keyFor('Teamwork', new Set(['teamwork']))).toBe('teamwork_2')
    expect(keyFor('x'.repeat(40), new Set()).length).toBe(32)
  })

  it('are kept where a criterion has one, and made where not', () => {
    const out = withKeys([
      { ...blankCriterion(), key: 'c1', label: '溝通' },
      { ...blankCriterion(), label: '貢獻' },
      { ...blankCriterion(), label: 'Reliability' },
    ])
    expect(out.map((c) => c.key)).toEqual(['c1', 'c2', 'reliability'])
  })
})

describe('what keeps a draft from being sent', () => {
  const ok = draftFrom(ratingForm)
  const keys = (d: PeerFormDraft) => formProblems(d).map((p) => p.key)

  it('is nothing for a good draft', () => {
    expect(formProblems(ok)).toEqual([])
  })

  it('is a rating form without criteria, an empty or repeated label, a weight out of range, or a bad scale', () => {
    expect(keys({ ...ok, criteria: [] })).toContain('noCriteria')
    expect(keys({ ...ok, criteria: [{ ...ok.criteria[0], label: '  ' }] })).toContain('labelRequired')
    expect(keys({ ...ok, criteria: [ok.criteria[0], { ...ok.criteria[1], label: 'contribution' }] })).toContain(
      'sameLabel',
    )
    expect(keys({ ...ok, criteria: [{ ...ok.criteria[0], weight: '11' }] })).toContain('criterionWeight')
    expect(keys({ ...ok, criteria: [{ ...ok.criteria[0], weight: 'two' }] })).toContain('criterionWeight')
    expect(keys({ ...ok, scaleMin: 1, scaleMax: 1 })).toContain('scale')
    expect(
      keys({ ...ok, criteria: Array.from({ length: 11 }, (_, i) => ({ ...blankCriterion(), label: `C${i}` })) }),
    ).toContain('tooManyCriteria')
  })

  it('is an opening time at or after the closing time, or none where it opens at a time', () => {
    expect(keys({ ...ok, opensAt: ok.closesAt })).toContain('opensBeforeCloses')
    expect(keys({ ...ok, opensAt: '' })).toContain('opensRequired')
    expect(keys({ ...ok, opens: 'on_hand_in', opensAt: '' })).not.toContain('opensRequired')
    expect(keys({ ...ok, closesAt: '' })).toContain('closesRequired')
  })

  it('is a weight that is not a whole number from 0 to 100', () => {
    expect(keys({ ...ok, weight: 101 })).toContain('weight')
    expect(keys({ ...ok, weight: 12.5 })).toContain('weight')
    expect(keys({ ...ok, weight: 0 })).not.toContain('weight')
  })

  it('ignores a share form’s criteria and scale', () => {
    expect(formProblems({ ...ok, kind: 'share', criteria: [], scaleMax: 0 })).toEqual([])
  })
})

describe('who sees what', () => {
  it('follows the form as Core says it', () => {
    const f = { ...ratingForm, visible_to: ['graders', 'action_record'], students_see: ['own_sheet', 'own_average'] }
    expect(whoSees(f)).toEqual({ staff: ['graders', 'action_record'], students: ['own_sheet', 'own_average'] })
  })

  it('follows a draft as it will be', () => {
    const d = draftFrom(ratingForm)
    expect(whoSees(d).students).toEqual(['own_sheet', 'own_average', 'own_adjustment'])
    const quiet: PeerFormDraft = { ...d, weight: 0, shareWithStudents: 'none' }
    expect(whoSees(quiet).students).toEqual(['own_sheet'])
    expect(whoSees({ ...d, enabled: false }).students).not.toContain('own_adjustment')
  })
})

describe('the fair-share score', () => {
  it('moves the group’s score by the weight of the difference, as the design’s example does', () => {
    // A group of four at 80 of 100, counted at 20 %: factors 1.2, 1.1, 1.1 and 0.6.
    expect(peerScore(80, 20, 1.2, 100)).toBe(83.2)
    expect(peerScore(80, 20, 1.1, 100)).toBe(81.6)
    expect(peerScore(80, 20, 0.6, 100)).toBe(73.6)
    // An even contributor gets exactly the group's score; a weight of 0 changes nothing.
    expect(peerScore(80, 20, 1, 100)).toBe(80)
    expect(peerScore(80, 0, 1.6, 100)).toBe(80)
  })

  it('is held to the points possible unless extra is allowed, and to zero', () => {
    expect(peerScore(95, 50, 1.5, 100)).toBe(100)
    expect(peerScore(95, 50, 1.5, 100, true)).toBe(118.75)
    expect(peerScore(10, 100, -1, 100)).toBe(0)
  })

  it('rounds half away from zero to two places', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(-1.005)).toBe(-1.01)
    expect(round2(83.2)).toBe(83.2)
  })

  it('counts only where the form is on and weighs something', () => {
    expect(formCounts({ enabled: true, weight: 20 })).toBe(true)
    expect(formCounts({ enabled: false, weight: 20 })).toBe(false)
    expect(formCounts({ enabled: true, weight: 0 })).toBe(false)
    expect(formCounts(null)).toBe(false)
  })
})
