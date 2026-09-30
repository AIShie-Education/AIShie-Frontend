import { describe, expect, it } from 'vitest'
import { RateMeter } from './transferRate'

describe('RateMeter', () => {
  it('gives no speed until the samples span long enough', () => {
    const m = new RateMeter(5_000, 800)
    expect(m.rate()).toBeNull()
    m.add(0, 0)
    expect(m.rate()).toBeNull()
    m.add(500, 500_000)
    expect(m.rate()).toBeNull()
    expect(m.secondsLeft(1_000_000)).toBeNull()
    m.add(1_000, 1_000_000)
    expect(m.rate()).toBe(1_000_000)
  })

  it('takes the speed over the last few seconds only', () => {
    const m = new RateMeter(2_000, 500)
    // A burst at first, as a browser's buffers fill, then a steady 100 kB/s.
    m.add(0, 0)
    m.add(100, 5_000_000)
    for (let t = 1_000; t <= 10_000; t += 1_000) m.add(t, 5_000_000 + ((t - 100) / 1_000) * 100_000)
    expect(m.rate()).toBeCloseTo(100_000, 0)
  })

  it('says how long the rest will take, in whole seconds', () => {
    const m = new RateMeter()
    m.add(0, 0)
    m.add(2_000, 2_000_000)
    expect(m.secondsLeft(10_000_000)).toBe(8)
    expect(m.secondsLeft(10_500_000)).toBe(9)
    expect(m.secondsLeft(2_000_000)).toBe(0)
  })

  it('says nothing of the time left while nothing moves', () => {
    const m = new RateMeter()
    m.add(0, 1_000)
    m.add(3_000, 1_000)
    expect(m.rate()).toBe(0)
    expect(m.secondsLeft(5_000)).toBeNull()
  })

  it('starts again when the count goes backwards, and when reset', () => {
    const m = new RateMeter()
    m.add(0, 0)
    m.add(1_000, 1_000_000)
    m.add(1_200, 0)
    expect(m.rate()).toBeNull()
    m.add(2_200, 500_000)
    expect(m.rate()).toBe(500_000)
    m.reset()
    expect(m.rate()).toBeNull()
  })
})
