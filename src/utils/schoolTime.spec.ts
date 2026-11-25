import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setLocale } from '@/i18n'
import { cutoffTimes, fromPickerDate, pickerDateToISO, setSchoolTimeZone, toPickerDate } from './schoolTime'

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
    const date = toPickerDate(DUE)
    expect(date.toISOString()).toBe(new Date(DUE).toISOString())
    expect(pickerDateToISO(date)).toBe(new Date(DUE).toISOString())
  })

  it('shows school time with reader time beside it, and round-trips the picker’s school wall time', () => {
    vi.stubEnv('TZ', 'Europe/London')
    setSchoolTimeZone('Asia/Hong_Kong')
    expect(cutoffTimes(DUE)).toEqual({
      primary: { time: '2026-10-08 23:59', zone: 'Hong Kong Standard Time' },
      reader: { time: '2026-10-08 16:59', zone: 'British Summer Time' },
    })
    const picked = toPickerDate(DUE)
    // The browser is in London, but the picker shows Hong Kong's 23:59 wall fields.
    expect([picked.getFullYear(), picked.getMonth(), picked.getDate(), picked.getHours(), picked.getMinutes()]).toEqual([
      2026, 9, 8, 23, 59,
    ])
    expect(picked.toISOString()).not.toBe(DUE)
    expect(fromPickerDate(picked).toISOString()).toBe(new Date(DUE).toISOString())
    expect(pickerDateToISO(picked)).toBe(new Date(DUE).toISOString())
  })

  it('does not repeat the reader’s clock when both zones are the same', () => {
    vi.stubEnv('TZ', 'Asia/Hong_Kong')
    setSchoolTimeZone('Asia/Hong_Kong')
    expect(cutoffTimes(DUE).reader).toBeUndefined()
  })
})
