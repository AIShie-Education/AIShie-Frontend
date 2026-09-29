import { afterEach, describe, expect, it, vi } from 'vitest'
import dayjs from 'dayjs'
import { LOCALES, dayjsLocale, i18n, initialLocale, intlLocale, localeForTag, setLocale } from '.'
import { formatDecimal, fromNow } from '@/utils/format'

// The message functions, as plainly typed as a test needs them.
const g = i18n.global as unknown as {
  t: (key: string, params: Record<string, unknown>, opts: { locale: string }) => string
  te: (key: string, locale: string) => boolean
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  setLocale('en')
  localStorage.clear()
})

describe('the languages', () => {
  it('are Traditional Chinese, Simplified Chinese and English, each named in itself', () => {
    expect(LOCALES).toEqual([
      { value: 'zh-Hant', label: '繁體中文' },
      { value: 'zh-Hans', label: '简体中文' },
      { value: 'en', label: 'English' },
    ])
  })

  it('each have messages', () => {
    for (const { value } of LOCALES) expect(g.te('common.nav.agents', value), value).toBe(true)
    expect(g.t('common.nav.agents', {}, { locale: 'zh-Hans' })).toBe('我的智能体')
    expect(g.t('common.nav.agents', {}, { locale: 'zh-Hant' })).toBe('我的代理')
  })
})

describe('a browser’s language', () => {
  it.each([
    // Simplified: the Mainland and Singapore, the script named, and a bare zh.
    ['zh-CN', 'zh-Hans'],
    ['zh-SG', 'zh-Hans'],
    ['zh-Hans', 'zh-Hans'],
    ['zh-Hans-CN', 'zh-Hans'],
    ['zh-Hans-HK', 'zh-Hans'],
    ['zh', 'zh-Hans'],
    ['zh-MY', 'zh-Hans'],
    // Traditional: Taiwan, Hong Kong and Macao, and the script named.
    ['zh-TW', 'zh-Hant'],
    ['zh-HK', 'zh-Hant'],
    ['zh-MO', 'zh-Hant'],
    ['zh-Hant', 'zh-Hant'],
    ['zh-Hant-TW', 'zh-Hant'],
    ['zh-Hant-CN', 'zh-Hant'],
    // Written any which way.
    ['ZH-tw', 'zh-Hant'],
    ['zh_HK', 'zh-Hant'],
    ['zh-hans', 'zh-Hans'],
    // Anything else is English.
    ['en-US', 'en'],
    ['en', 'en'],
    ['fr-FR', 'en'],
    ['ja-JP', 'en'],
    ['', 'en'],
    [undefined, 'en'],
  ] as const)('%s is shown in %s', (tag, locale) => {
    expect(localeForTag(tag)).toBe(locale)
  })
})

describe('the first language', () => {
  const browserAsks = (tag: string) => vi.spyOn(navigator, 'language', 'get').mockReturnValue(tag)

  it('is the browser’s when nothing was chosen here', () => {
    browserAsks('zh-CN')
    expect(initialLocale()).toBe('zh-Hans')
    browserAsks('zh-HK')
    expect(initialLocale()).toBe('zh-Hant')
    browserAsks('de-DE')
    expect(initialLocale()).toBe('en')
  })

  it('is the one chosen before in this browser, whatever the browser asks for', () => {
    browserAsks('en-US')
    localStorage.setItem('aishie.locale', 'zh-Hans')
    expect(initialLocale()).toBe('zh-Hans')
    browserAsks('zh-CN')
    localStorage.setItem('aishie.locale', 'zh-Hant')
    expect(initialLocale()).toBe('zh-Hant')
    localStorage.setItem('aishie.locale', 'en')
    expect(initialLocale()).toBe('en')
  })

  it('is the browser’s when what was kept is not a language the app offers', () => {
    browserAsks('zh-SG')
    localStorage.setItem('aishie.locale', 'zh-CN')
    expect(initialLocale()).toBe('zh-Hans')
  })

  it('is the browser’s when there is no storage', () => {
    browserAsks('zh-TW')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(initialLocale()).toBe('zh-Hant')
  })
})

describe('setLocale', () => {
  it('sets the page in Simplified Chinese: messages, <html lang>, dates and numbers the Mainland’s way, and remembers it', () => {
    setLocale('zh-Hans')
    expect(i18n.global.locale.value).toBe('zh-Hans')
    expect(document.documentElement.lang).toBe('zh-Hans')
    expect(dayjs.locale()).toBe('zh-cn')
    expect(fromNow(dayjs().subtract(3, 'minute').toISOString())).toBe('3 分钟前')
    const numbers = vi.spyOn(Number.prototype, 'toLocaleString')
    expect(formatDecimal(1234.5)).toBe('1,234.5')
    expect(numbers).toHaveBeenCalledWith('zh-CN', { maximumFractionDigits: 2 })
    expect(localStorage.getItem('aishie.locale')).toBe('zh-Hans')
  })

  it('sets it in Traditional Chinese, and back in English', () => {
    setLocale('zh-Hant')
    expect(document.documentElement.lang).toBe('zh-Hant')
    expect(dayjs.locale()).toBe('zh-tw')
    expect(fromNow(dayjs().subtract(3, 'minute').toISOString())).toBe('3 分鐘前')
    setLocale('en')
    expect(document.documentElement.lang).toBe('en')
    expect(fromNow(dayjs().subtract(3, 'minute').toISOString())).toBe('3 minutes ago')
    expect(localStorage.getItem('aishie.locale')).toBe('en')
  })

  it('names each language to dayjs and to Intl', () => {
    expect(LOCALES.map((l) => [dayjsLocale(l.value), intlLocale(l.value)])).toEqual([
      ['zh-tw', 'zh-TW'],
      ['zh-cn', 'zh-CN'],
      ['en', 'en'],
    ])
  })
})
