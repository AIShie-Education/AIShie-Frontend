import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setLocale } from '@/i18n'
import {
  cutoffTimes,
  pickerDateDisabled,
  pickerInstant,
  pickerToday,
  pickerWallTimeToISO,
  setSchoolTimeZone,
  toPickerWallTime,
} from './schoolTime'

const DUE = '2026-10-08T15:59:00Z'

beforeEach(() => {
  setLocale('en')
  setSchoolTimeZone(undefined)
})
afterEach(() => {
  vi.unstubAllEnvs()
  setSchoolTimeZone(undefined)
  setLocale('en')
})

describe('the school’s time zone', () => {
  it('leaves cut-offs and picker conversion on the reader’s clock when Core omits it', () => {
    vi.stubEnv('TZ', 'Europe/London')
    expect(cutoffTimes(DUE)).toEqual({
      primary: { time: '2026-10-08 16:59', zone: 'British Summer Time' },
    })
    const wall = toPickerWallTime(DUE)
    expect(wall).toBe('2026-10-08T16:59')
    expect(pickerInstant(wall, DUE)).toBe(new Date(DUE).toISOString())
  })

  it('shows school time with reader time beside it, and round-trips exact school wall fields', () => {
    vi.stubEnv('TZ', 'Europe/London')
    setSchoolTimeZone('Asia/Hong_Kong')
    expect(cutoffTimes(DUE)).toEqual({
      primary: { time: '2026-10-08 23:59', zone: 'Hong Kong Standard Time' },
      reader: { time: '2026-10-08 16:59', zone: 'British Summer Time' },
    })
    const wall = toPickerWallTime(DUE)
    expect(wall).toBe('2026-10-08T23:59')
    expect(pickerInstant(wall, DUE)).toBe(new Date(DUE).toISOString())
  })

  it('does not repeat the reader’s clock when both zones are the same', () => {
    vi.stubEnv('TZ', 'Asia/Hong_Kong')
    setSchoolTimeZone('Asia/Hong_Kong')
    expect(cutoffTimes(DUE).reader).toBeUndefined()
  })
})

describe('wall time across daylight-saving gaps and folds', () => {
  it('keeps a school wall time that does not exist on the reader’s clock unchanged', () => {
    vi.stubEnv('TZ', 'America/New_York')
    setSchoolTimeZone('Asia/Hong_Kong')
    const due = '2026-03-07T18:30:00Z'
    const wall = toPickerWallTime(due)
    expect(wall).toBe('2026-03-08T02:30')
    expect(pickerInstant(wall, due)).toBe(new Date(due).toISOString())
    expect(pickerWallTimeToISO(wall)).toBe(new Date(due).toISOString())
  })

  it('rejects a school wall time in a DST gap instead of moving it', () => {
    expect(() => pickerWallTimeToISO('2026-03-08T02:30', 'America/New_York')).toThrowError(
      expect.objectContaining({ problem: 'nonexistent' }),
    )
  })

  it('rejects an ambiguous school wall time, but preserves either existing fold instant untouched', () => {
    expect(() => pickerWallTimeToISO('2026-11-01T01:30', 'America/New_York')).toThrowError(
      expect.objectContaining({ problem: 'ambiguous' }),
    )
    for (const due of ['2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z']) {
      expect(toPickerWallTime(due, 'America/New_York')).toBe('2026-11-01T01:30')
      expect(pickerInstant('2026-11-01T01:30', due, 'America/New_York')).toBe(new Date(due).toISOString())
    }
  })

  it('uses the picker’s own current day, not the reader’s', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-03-08T05:00:00Z'))
    setSchoolTimeZone('America/New_York')
    expect(pickerToday()).toBe('2026-03-08')
    expect(pickerDateDisabled(new Date(2026, 2, 8, 12))).toBe(false)
    expect(pickerDateDisabled(new Date(2026, 2, 7, 12))).toBe(true)
    vi.useRealTimers()
  })
})
