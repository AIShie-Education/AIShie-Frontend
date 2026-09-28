import { afterEach, describe, expect, it } from 'vitest'
import { coreClockOffset, coreNow, noteCoreDate, resetCoreClock } from './clock'

afterEach(() => resetCoreClock())

describe('Core’s clock', () => {
  const received = Date.parse('2026-09-28T10:00:00.000Z')

  it('is this browser’s when their clocks agree, within the header’s rounding', () => {
    noteCoreDate('Mon, 28 Sep 2026 10:00:00 GMT', received + 700)
    expect(coreClockOffset()).toBe(0)
    noteCoreDate('Mon, 28 Sep 2026 10:00:01 GMT', received)
    expect(coreClockOffset()).toBe(0)
  })

  it('is ahead or behind by as much as Core’s Date header says', () => {
    // Core read 10:03:00 while this browser read 10:00:00: three minutes ahead.
    noteCoreDate('Mon, 28 Sep 2026 10:03:00 GMT', received)
    expect(coreClockOffset()).toBe(3 * 60_000 + 500)
    const before = Date.now()
    expect(coreNow()).toBeGreaterThanOrEqual(before + 3 * 60_000)
    noteCoreDate('Mon, 28 Sep 2026 09:58:00 GMT', received)
    expect(coreClockOffset()).toBe(-2 * 60_000 + 500)
  })

  it('keeps what it knew when an answer has no date, or one it cannot read', () => {
    noteCoreDate('Mon, 28 Sep 2026 10:03:00 GMT', received)
    noteCoreDate(null, received)
    noteCoreDate('not a date', received)
    expect(coreClockOffset()).toBe(3 * 60_000 + 500)
  })
})
