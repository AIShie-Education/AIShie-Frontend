import { afterEach, describe, expect, it, vi } from 'vitest'
import { setLocale, type Locale } from '@/i18n'
import { courseCodeText, joinParts, zonedText } from './parts'

afterEach(() => {
  vi.unstubAllEnvs()
  setLocale('en')
})

describe('what joins words where only a string will do', () => {
  it.each([
    ['en', 'PDF · 1.2 MB · 3 pages'],
    ['zh-Hant', 'PDF · 1.2 MB · 3 pages'],
    ['zh-Hans', 'PDF · 1.2 MB · 3 pages'],
  ] as [Locale, string][])('puts the language’s dot between the parts there are, in %s', (lang, line) => {
    setLocale(lang)
    expect(joinParts(['PDF', '1.2 MB', null, undefined, false, '', '3 pages'])).toBe(line)
    expect(joinParts(['PDF'])).toBe('PDF')
    expect(joinParts([null, false])).toBe('')
  })

  it.each([
    ['en', 'CS101 · A'],
    ['zh-Hant', 'CS101·A'],
    ['zh-Hans', 'CS101·A'],
  ] as [Locale, string][])('names a course by its code and section as %s does', (lang, code) => {
    setLocale(lang)
    expect(courseCodeText('CS101', 'A')).toBe(code)
    expect(courseCodeText('CS101', '')).toBe('CS101')
    expect(courseCodeText('CS101', null)).toBe('CS101')
  })

  it.each([
    ['en', '2026-10-08 23:59 (Hong Kong Standard Time)'],
    ['zh-Hant', '香港標準時間 2026-10-08 23:59'],
    ['zh-Hans', '香港标准时间 2026-10-08 23:59'],
  ] as [Locale, string][])('says a cut-off on the reader’s clock with the zone named, in %s', (lang, text) => {
    vi.stubEnv('TZ', 'Asia/Hong_Kong')
    setLocale(lang)
    expect(zonedText('2026-10-08T15:59:00Z')).toBe(text)
    expect(zonedText(null)).toBe('—')
  })
})
