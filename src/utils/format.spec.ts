import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  downloadName,
  formatCount,
  formatDateTime,
  formatList,
  formatMoney,
  formatPct,
  formatPercent,
  formatTime,
  formatUtc,
  setNumberLocale,
  timeZoneName,
  titleFromFileName,
} from './format'

describe('downloadName', () => {
  it('keeps a name that has an extension', () => {
    expect(downloadName('converter.py', 'text/x-python')).toBe('converter.py')
    expect(downloadName('server.log', 'text/plain')).toBe('server.log')
  })
  it('adds the usual extension for the type where the name has none', () => {
    expect(downloadName('Week 1 slides', 'application/pdf')).toBe('Week 1 slides.pdf')
    expect(downloadName('Syllabus v2.1', 'text/markdown; charset=utf-8')).toBe('Syllabus v2.1.md')
  })
  it('leaves a name alone when the type is not known', () => {
    expect(downloadName('data', 'application/octet-stream')).toBe('data')
    expect(downloadName('data', null)).toBe('data')
  })
  it('replaces what a file system does not take, and never gives an empty name', () => {
    expect(downloadName('a/b: c?', 'text/plain')).toBe('a_b_ c_.txt')
    expect(downloadName('', undefined)).toBe('download')
  })
})

describe('titleFromFileName', () => {
  it('leaves out the extension, which a download puts back', () => {
    expect(titleFromFileName('Week 3 — Loops.pdf')).toBe('Week 3 — Loops')
    expect(titleFromFileName('slides.v2.pptx')).toBe('slides.v2')
    expect(titleFromFileName('Syllabus v2.1')).toBe('Syllabus v2.1')
    expect(titleFromFileName('README')).toBe('README')
    expect(titleFromFileName('.pdf')).toBe('.pdf')
    expect(titleFromFileName('  第三週 講義.docx ')).toBe('第三週 講義')
  })
})

describe('the time of day, in the reader’s time zone and in UTC', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    setNumberLocale(undefined)
  })

  it('is on the reader’s clock, with their zone named in the page’s language', () => {
    vi.stubEnv('TZ', 'Asia/Hong_Kong')
    setNumberLocale('en')
    expect(formatTime('2026-10-02T00:00:00Z')).toBe('08:00')
    expect(formatDateTime('2026-10-08T15:59:00Z')).toBe('2026-10-08 23:59')
    expect(timeZoneName('2026-10-02T00:00:00Z')).toBe('Hong Kong Standard Time')
    setNumberLocale('zh-TW')
    expect(timeZoneName('2026-10-02T00:00:00Z')).toBe('香港標準時間')
    setNumberLocale('zh-CN')
    expect(timeZoneName('2026-10-02T00:00:00Z')).toBe('香港标准时间')
  })

  it('names the zone as it is at that time, summer time or not', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    setNumberLocale('en')
    expect(formatTime('2026-10-02T00:00:00Z')).toBe('17:00')
    expect(timeZoneName('2026-10-02T00:00:00Z')).toBe('Pacific Daylight Time')
    expect(formatTime('2026-12-02T00:00:00Z')).toBe('16:00')
    expect(timeZoneName('2026-12-02T00:00:00Z')).toBe('Pacific Standard Time')
  })

  it('is the offset alone where the browser cannot name the zone', () => {
    vi.stubEnv('TZ', 'Asia/Hong_Kong')
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new RangeError('no time zones here')
    })
    try {
      expect(timeZoneName('2026-10-02T00:00:00Z')).toBe('UTC+08:00')
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('is exact in UTC, whatever the reader’s zone', () => {
    vi.stubEnv('TZ', 'Asia/Hong_Kong')
    expect(formatUtc('2026-10-02T00:00:00Z')).toBe('2026-10-02 00:00 UTC')
    expect(formatUtc('2026-10-02T08:30:00+08:00')).toBe('2026-10-02 00:30 UTC')
    expect(formatUtc(null)).toBe('—')
    expect(formatUtc('soon')).toBe('—')
    expect(formatTime(undefined)).toBe('—')
  })
})

describe('percentages, money, counts and lists, in the page’s language', () => {
  afterEach(() => setNumberLocale(undefined))

  // The page's three languages, as Intl names them (i18n's intlLocale).
  const LANGS = ['en', 'zh-TW', 'zh-CN'] as const

  it.each(LANGS)('writes a percentage with no space before its sign, in %s', (tag) => {
    setNumberLocale(tag)
    expect(formatPct(0.8846, 2)).toBe('88.46%')
    expect(formatPct(0.47, 0)).toBe('47%')
    expect(formatPct(1.05)).toBe('105%')
    expect(formatPercent('9.125', '10')).toBe('91.3%')
    expect(formatPercent(null, '10')).toBe('—')
  })

  it.each(LANGS)(
    'writes dollars as US dollars, to the cent from a dollar up and to three figures below it, in %s',
    (tag) => {
      setNumberLocale(tag)
      expect(formatMoney('0.018400')).toBe('US$0.0184')
      expect(formatMoney('0.998100')).toBe('US$0.998')
      expect(formatMoney('0.004213')).toBe('US$0.00421')
      expect(formatMoney('2.118200')).toBe('US$2.12')
      expect(formatMoney('100')).toBe('US$100.00')
      expect(formatMoney('0.5')).toBe('US$0.50')
      expect(formatMoney('0')).toBe('US$0.00')
      expect(formatMoney(0)).toBe('US$0.00')
      expect(formatMoney('1234.5')).toBe('US$1,234.50')
      expect(formatMoney(null)).toBe('—')
      expect(formatMoney('')).toBe('—')
    },
  )

  it.each(LANGS)('writes a price someone typed with every figure it has, at least the cents, in %s', (tag) => {
    setNumberLocale(tag)
    expect(formatMoney('1.875', { exact: true })).toBe('US$1.875')
    expect(formatMoney('0.075000', { exact: true })).toBe('US$0.075')
    expect(formatMoney('0.4', { exact: true })).toBe('US$0.40')
    expect(formatMoney('3', { exact: true })).toBe('US$3.00')
    expect(formatMoney('0.000125', { exact: true })).toBe('US$0.000125')
  })

  it.each(LANGS)('writes a count with its thousands grouped, in %s', (tag) => {
    setNumberLocale(tag)
    expect(formatCount(1284)).toBe('1,284')
    expect(formatCount(0)).toBe('0')
    expect(formatCount(null)).toBe('—')
  })

  it.each([
    ['en', 'Traditional Chinese, Simplified Chinese, and English', '@a.edu, @b.edu, or @c.edu', '@a.edu or @b.edu'],
    ['zh-TW', 'Traditional Chinese、Simplified Chinese和English', '@a.edu、@b.edu或@c.edu', '@a.edu或@b.edu'],
    ['zh-CN', 'Traditional Chinese、Simplified Chinese和English', '@a.edu、@b.edu或@c.edu', '@a.edu或@b.edu'],
  ])('joins a list as the language does, all of it or one of it, in %s', (tag, all, oneOfThree, oneOfTwo) => {
    setNumberLocale(tag)
    expect(formatList(['Traditional Chinese', 'Simplified Chinese', 'English'])).toBe(all)
    expect(formatList(['@a.edu', '@b.edu', '@c.edu'], 'or')).toBe(oneOfThree)
    expect(formatList(['@a.edu', '@b.edu'], 'or')).toBe(oneOfTwo)
    expect(formatList(['@a.edu'], 'or')).toBe('@a.edu')
    expect(formatList([])).toBe('')
  })
})
