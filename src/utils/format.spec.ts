import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadName, formatTime, formatUtc, setNumberLocale, timeZoneName, titleFromFileName } from './format'

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
