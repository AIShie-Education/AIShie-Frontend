import { describe, expect, it } from 'vitest'
import { nextDailyReset } from './dailyReset'

describe('nextDailyReset', () => {
  const now = Date.parse('2026-10-01T10:00:00Z')

  it('is a day after the start of the day the runtime is counting', () => {
    expect(nextDailyReset('2026-10-01T00:00:00Z', now)).toBe('2026-10-02T00:00:00.000Z')
  })

  it('follows a runtime whose day starts at another hour', () => {
    // A day from midnight in Hong Kong.
    expect(nextDailyReset('2026-09-30T16:00:00Z', now)).toBe('2026-10-01T16:00:00.000Z')
    expect(nextDailyReset('2026-10-01T08:30:00+08:00', now)).toBe('2026-10-02T00:30:00.000Z')
  })

  it('is the next 00:00 UTC where the runtime names no day, as its documents say', () => {
    expect(nextDailyReset(undefined, now)).toBe('2026-10-02T00:00:00.000Z')
    expect(nextDailyReset(null, now)).toBe('2026-10-02T00:00:00.000Z')
    expect(nextDailyReset('', now)).toBe('2026-10-02T00:00:00.000Z')
    expect(nextDailyReset('not a time', now)).toBe('2026-10-02T00:00:00.000Z')
    // At 00:00 UTC exactly, the day has just started again: the next is a day off.
    expect(nextDailyReset(undefined, Date.parse('2026-10-01T00:00:00Z'))).toBe('2026-10-02T00:00:00.000Z')
  })

  it('gives the next one, at the same time of day, for a day read before it ended', () => {
    expect(nextDailyReset('2026-09-28T00:00:00Z', now)).toBe('2026-10-02T00:00:00.000Z')
    expect(nextDailyReset('2026-09-30T00:00:00Z', Date.parse('2026-10-01T00:00:00Z'))).toBe('2026-10-02T00:00:00.000Z')
  })

  it('is always a whole day after the last, whatever the reader’s clocks do', () => {
    // Summer time ends in New York on 1 November 2026: still 24 hours.
    expect(nextDailyReset('2026-11-01T00:00:00Z', Date.parse('2026-11-01T12:00:00Z'))).toBe('2026-11-02T00:00:00.000Z')
  })
})
