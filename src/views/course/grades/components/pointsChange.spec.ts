import { describe, expect, it } from 'vitest'
import { compareDecimals, rescaleScore } from './grading'
import { isLiveEntered, pointsPlan } from './pointsChange'

describe('rescaleScore', () => {
  it('converts a score in proportion, as Core does', () => {
    expect(rescaleScore(85, 100, 50)).toBe('42.5')
    expect(rescaleScore('45', '50', '100')).toBe('90')
    expect(rescaleScore(0, 10, 20)).toBe('0')
  })
  it('rounds to four places, half away from zero', () => {
    expect(rescaleScore(1, 3, 1)).toBe('0.3333')
    expect(rescaleScore(2, 3, 1)).toBe('0.6667')
    expect(rescaleScore('0.00005', 1, 1)).toBe('0.0001')
  })
  it('has nothing to rescale from zero points', () => {
    expect(rescaleScore(5, 0, 10)).toBeNull()
    expect(rescaleScore('x', 10, 10)).toBeNull()
  })
})

describe('compareDecimals', () => {
  it('compares exactly, whatever the number of places', () => {
    expect(compareDecimals('0.1', 0.1)).toBe(0)
    expect(compareDecimals('50.0001', 50)).toBe(1)
    expect(compareDecimals(9.99, '10')).toBe(-1)
    expect(compareDecimals('-1', 0)).toBe(-1)
    expect(compareDecimals('abc', 1)).toBeNull()
  })
})

describe('pointsPlan', () => {
  it('explains both choices with the highest score there is', () => {
    const p = pointsPlan(['70', '85', '40'], 100, '50')
    expect(p.count).toBe(3)
    expect(p.rescale.example).toEqual({ score: '85', becomes: '42.5' })
    expect(p.rescale.blocked).toBeNull()
    // 85 and 70 are above 50: keeping the scores is refused, for the highest of them.
    expect(p.keep_scores.blocked).toEqual({ reason: 'score_above_points', count: 2 })
    expect(p.keep_scores.example).toEqual({ score: '85', becomes: '85' })
  })
  it('lets the scores be kept when none would be above the new points', () => {
    const p = pointsPlan(['8', '9.5'], '10', '20')
    expect(p.keep_scores.blocked).toBeNull()
    expect(p.keep_scores.example).toEqual({ score: '9.5', becomes: '9.5' })
    expect(p.rescale.example).toEqual({ score: '9.5', becomes: '19' })
  })
  it('does not count extra credit already above the old points against keeping them', () => {
    // 12 of 10 was extra credit already: Core leaves it so.
    const p = pointsPlan(['12', '4'], 10, 8)
    expect(p.keep_scores.blocked).toBeNull()
  })
  it('refuses to rescale from nothing', () => {
    const p = pointsPlan(['0'], 0, 10)
    expect(p.rescale.blocked).toEqual({ reason: 'nothing_to_rescale' })
    expect(p.keep_scores.blocked).toBeNull()
  })
  it('takes full marks for the example when the scores could not be read', () => {
    const p = pointsPlan(null, 100, 50)
    expect(p.count).toBeNull()
    expect(p.rescale.example).toEqual({ score: '100', becomes: '50' })
    expect(p.keep_scores.blocked).toBeNull()
  })
})

describe('isLiveEntered', () => {
  it('is a grade a grader entered that stands now', () => {
    expect(isLiveEntered({ origin: 'entered', state: 'draft', superseded_by: null })).toBe(true)
    expect(isLiveEntered({ origin: 'entered', state: 'posted' })).toBe(true)
    expect(isLiveEntered({ origin: 'entered', state: 'superseded', superseded_by: 'g2' })).toBe(false)
    expect(isLiveEntered({ origin: 'computed', state: 'posted' })).toBe(false)
  })
})
