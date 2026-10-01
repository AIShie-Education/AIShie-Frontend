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

  it('holds still through the header’s rounding when the clocks differ, and moves when one is put right', () => {
    // Ten minutes ahead, by answers that arrive at every point of a second:
    // what is learnt first is kept, and a countdown does not jump back and forth.
    noteCoreDate('Mon, 28 Sep 2026 10:10:00 GMT', received + 50)
    expect(coreClockOffset()).toBe(10 * 60_000 + 450)
    for (const into of [150, 400, 650, 900, 1100]) {
      noteCoreDate('Mon, 28 Sep 2026 10:10:00 GMT', received + into)
      expect(coreClockOffset()).toBe(10 * 60_000 + 450)
    }
    // This browser's clock put right: Core's now agrees with it.
    noteCoreDate('Mon, 28 Sep 2026 10:00:02 GMT', received + 2000)
    expect(coreClockOffset()).toBe(0)
    // And put wrong again, by three seconds.
    noteCoreDate('Mon, 28 Sep 2026 10:00:06 GMT', received + 3000)
    expect(coreClockOffset()).toBe(3500)
  })

  it('keeps what it knew when an answer has no date, or one it cannot read', () => {
    noteCoreDate('Mon, 28 Sep 2026 10:03:00 GMT', received)
    noteCoreDate(null, received)
    noteCoreDate('not a date', received)
    expect(coreClockOffset()).toBe(3 * 60_000 + 500)
  })
})
