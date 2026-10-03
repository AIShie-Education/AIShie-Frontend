import { describe, expect, it } from 'vitest'
import { formatScore, fractionPercent, mulDecimals, percentOf, plainDecimal, shares, shortScore } from './grading'

describe('plainDecimal', () => {
  it('keeps every place and drops trailing zeros', () => {
    expect(plainDecimal(9.125)).toBe('9.125')
    expect(plainDecimal('12.50')).toBe('12.5')
    expect(plainDecimal('007')).toBe('7')
    expect(plainDecimal('.5')).toBe('0.5')
    expect(plainDecimal('-0.0')).toBe('0')
  })
  it('writes an exponent out', () => {
    expect(plainDecimal(1e-7)).toBe('0.0000001')
    expect(plainDecimal('1.5e3')).toBe('1500')
    expect(plainDecimal(1e21)).toBe('1000000000000000000000')
  })
  it('refuses what is not a decimal', () => {
    expect(plainDecimal(null)).toBeNull()
    expect(plainDecimal('')).toBeNull()
    expect(plainDecimal('abc')).toBeNull()
    expect(plainDecimal('.')).toBeNull()
  })
})

describe('formatScore', () => {
  it('never rounds', () => {
    expect(formatScore(9.125)).toBe('9.125')
    expect(formatScore('78')).toBe('78')
    expect(formatScore(0.0001)).toBe('0.0001')
    expect(formatScore(null)).toBe('—')
  })
})

describe('shortScore', () => {
  it('gives a score of more than two places to two, half away from zero, and nothing for one that has no more', () => {
    expect(shortScore(72.3333)).toBe('72.33')
    expect(shortScore('9.125')).toBe('9.13')
    expect(shortScore(-9.125)).toBe('-9.13')
    expect(shortScore(77.7778)).toBe('77.78')
    // Trailing zeros of the rounding are not shown: 72.3999 is 72.4, not 72.40.
    expect(shortScore(72.3999)).toBe('72.4')
    expect(shortScore(99.999)).toBe('100')
    expect(shortScore(1e-7)).toBe('0')
    expect(shortScore(72.25)).toBeNull()
    expect(shortScore('12.50')).toBeNull()
    expect(shortScore(6)).toBeNull()
    expect(shortScore(null)).toBeNull()
  })
})

describe('percentages', () => {
  it('rounds to two places, half away from zero, as Core does', () => {
    expect(percentOf(9.125, 10)).toBe('91.25%')
    expect(percentOf(1, 3)).toBe('33.33%')
    expect(percentOf(2, 3)).toBe('66.67%')
    expect(percentOf('0.00005', 1)).toBe('0.01%')
    expect(percentOf(10, 10)).toBe('100%')
    expect(percentOf(11, 10)).toBe('110%')
    expect(percentOf(5, 0)).toBe('—')
    expect(percentOf(null, 10)).toBe('—')
  })
  it('turns a fraction into the percentage Core writes down', () => {
    expect(fractionPercent(0.9125)).toBe('91.25%')
    expect(fractionPercent(0.3333333333333333)).toBe('33.33%')
    expect(fractionPercent(0.12345)).toBe('12.35%')
    expect(fractionPercent(null)).toBe('—')
  })
})

describe('mulDecimals', () => {
  it('recovers a score from its fraction exactly', () => {
    expect(mulDecimals(0.9125, 10)).toBe('9.125')
    expect(mulDecimals(0.8633333333333333, 9)).toBe('7.77')
    expect(mulDecimals(0, 100)).toBe('0')
  })
})

describe('shares', () => {
  it('shares the result among what counted only', () => {
    const s = shares([
      { id: 'graded', weight: 60, fraction: 0.9125 },
      { id: 'ungraded', weight: 40, fraction: null },
    ])
    expect(s.get('graded')).toBe(1)
    expect(s.get('ungraded')).toBeNull()
  })
  it('leaves dropped and weightless items out', () => {
    const s = shares([
      { id: 'a', weight: 10, fraction: 0.5, dropped: true },
      { id: 'b', weight: 10, fraction: 0.9 },
      { id: 'c', weight: 30, fraction: 1 },
      { id: 'd', weight: 0, fraction: 1 },
    ])
    expect(s.get('a')).toBeNull()
    expect(s.get('b')).toBe(0.25)
    expect(s.get('c')).toBe(0.75)
    expect(s.get('d')).toBeNull()
  })
})
