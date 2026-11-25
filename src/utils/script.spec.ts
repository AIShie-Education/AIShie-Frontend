import { afterEach, describe, expect, it } from 'vitest'
import { setLocale } from '@/i18n'
import { scriptLanguage } from './script'

afterEach(() => setLocale('en'))

describe('the language of data in another script', () => {
  it('marks Han as Traditional Chinese on an English page', () => {
    setLocale('en')
    expect(scriptLanguage('林家明')).toBe('zh-Hant')
    expect(scriptLanguage('CS101 程式設計入門')).toBe('zh-Hant')
  })

  it('keeps the page’s Chinese script, and leaves Latin data unmarked', () => {
    setLocale('zh-Hans')
    expect(scriptLanguage('林家明')).toBe('zh-Hans')
    setLocale('zh-Hant')
    expect(scriptLanguage('林家明')).toBe('zh-Hant')
    for (const text of ['Nguyễn Văn An', 'Łukasz Nowak', 'O’Brien', '', null, undefined]) {
      expect(scriptLanguage(text)).toBeUndefined()
    }
  })
})
