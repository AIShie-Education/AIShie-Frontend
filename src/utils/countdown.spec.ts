import { describe, expect, it } from 'vitest'
import { countdownParts, formatCountdown, remainingMs } from './countdown'

describe('remainingMs', () => {
  const now = Date.parse('2026-09-28T10:00:00Z')
  it('is what is left until the time, from a string, a number or a date', () => {
    expect(remainingMs('2026-09-28T10:10:00Z', now)).toBe(600_000)
    expect(remainingMs(now + 1234, now)).toBe(1234)
    expect(remainingMs(new Date(now + 5000), now)).toBe(5000)
  })
  it('is never below zero, and zero for nothing or a time it cannot read', () => {
    expect(remainingMs('2026-09-28T09:59:00Z', now)).toBe(0)
    expect(remainingMs(null, now)).toBe(0)
    expect(remainingMs(undefined, now)).toBe(0)
    expect(remainingMs('soon', now)).toBe(0)
  })
})

describe('formatCountdown', () => {
  it('shows minutes and seconds, two digits each', () => {
    expect(formatCountdown(600_000)).toBe('10:00')
    expect(formatCountdown(65_000)).toBe('01:05')
    expect(formatCountdown(9_000)).toBe('00:09')
  })
  it('counts a second begun as a whole one, so that 00:00 comes only at the end', () => {
    expect(formatCountdown(599_001)).toBe('10:00')
    expect(formatCountdown(599_000)).toBe('09:59')
    expect(formatCountdown(1)).toBe('00:01')
    expect(formatCountdown(0)).toBe('00:00')
    expect(formatCountdown(-5000)).toBe('00:00')
    expect(formatCountdown(Number.NaN)).toBe('00:00')
  })
  it('shows hours from an hour up', () => {
    expect(formatCountdown(3_600_000)).toBe('1:00:00')
    expect(formatCountdown(3_723_000)).toBe('1:02:03')
    expect(formatCountdown(3_599_000)).toBe('59:59')
  })
})

describe('countdownParts', () => {
  it('gives whole minutes and seconds, counted as the clock shows them', () => {
    expect(countdownParts(600_000)).toEqual({ minutes: 10, seconds: 0 })
    expect(countdownParts(65_500)).toEqual({ minutes: 1, seconds: 6 })
    expect(countdownParts(0)).toEqual({ minutes: 0, seconds: 0 })
  })
})
