import { describe, expect, it } from 'vitest'
import { ONLINE_WITHIN_MS, presenceOf } from './presence'

const NOW = Date.parse('2026-09-26T12:00:00Z')

describe('presenceOf', () => {
  it('is never for an agent that never used a token', () => {
    expect(presenceOf(null, NOW)).toBe('never')
    expect(presenceOf(undefined, NOW)).toBe('never')
    expect(presenceOf('not a time', NOW)).toBe('never')
  })
  it('is online within the window, and seen after it', () => {
    expect(presenceOf('2026-09-26T11:59:00Z', NOW)).toBe('online')
    expect(presenceOf(new Date(NOW - ONLINE_WITHIN_MS).toISOString(), NOW)).toBe('online')
    expect(presenceOf(new Date(NOW - ONLINE_WITHIN_MS - 1000).toISOString(), NOW)).toBe('seen')
    expect(presenceOf('2026-09-25T12:00:00Z', NOW)).toBe('seen')
  })
  it('takes a time ahead of this clock as online', () => {
    expect(presenceOf('2026-09-26T12:05:00Z', NOW)).toBe('online')
  })
  it('takes another window', () => {
    expect(presenceOf('2026-09-26T11:50:00Z', NOW, 15 * 60 * 1000)).toBe('online')
  })
})
