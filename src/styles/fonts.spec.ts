import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Each script's typefaces, as the chunks setLocale fetches: which were loaded.
const loaded = vi.hoisted(() => [] as string[])
vi.mock('./fonts-zh-hant', () => {
  loaded.push('Noto TC')
  return {}
})
vi.mock('./fonts-zh-hans', () => {
  loaded.push('Noto SC')
  return {}
})

const { setLocale } = await import('@/i18n')

/** Lets a check of the page that is queued run, and a dynamic import that has begun finish. */
const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0))
}

afterEach(() => localStorage.clear())

describe('the typefaces', () => {
  it('are loaded for a page in Chinese only, each script its own: Simplified Chinese gets SC, not TC', async () => {
    setLocale('en')
    await settle()
    expect(loaded).toEqual([])

    setLocale('zh-Hans')
    await settle()
    expect(loaded).toEqual(['Noto SC'])

    // Back and forth loads nothing again.
    setLocale('en')
    setLocale('zh-Hans')
    await settle()
    expect(loaded).toEqual(['Noto SC'])

    setLocale('zh-Hant')
    await settle()
    expect(loaded).toEqual(['Noto SC', 'Noto TC'])
    setLocale('en')
  })
})

describe('a page in English', () => {
  // A module of its own each time, which has loaded nothing.
  let loadFontsFor: (locale: string) => void
  beforeEach(async () => {
    vi.resetModules()
    loaded.length = 0
    vi.doMock('./fonts-zh-hant', () => {
      loaded.push('Noto TC')
      return {}
    })
    vi.doMock('./fonts-zh-hans', () => {
      loaded.push('Noto SC')
      return {}
    })
    document.body.innerHTML = ''
    ;({ loadFontsFor } = await import('./fonts'))
  })
  afterEach(() => {
    // Stops watching the page.
    loadFontsFor('fr')
    document.body.innerHTML = ''
  })

  const add = (html: string) => {
    const el = document.createElement('div')
    el.innerHTML = html
    document.body.append(el)
    return el
  }

  it('loads no Chinese typeface while it shows no Chinese, nor for a language’s own name in a language menu', async () => {
    add('<p>Introduction to Programming</p>')
    loadFontsFor('en')
    await settle()
    add(
      '<ul><li lang="zh-Hant">繁體中文</li><li lang="zh-Hans"><span>简体中文</span></li><li lang="en">English</li></ul>',
    )
    // What a browser that runs scripts never shows (index.html's loading screen has some).
    add('<noscript>需要啟用 JavaScript</noscript>')
    await settle()
    expect(loaded).toEqual([])
  })

  it('loads Traditional Chinese’s, once, when a name or a title in Chinese comes into it', async () => {
    loadFontsFor('en')
    await settle()
    expect(loaded).toEqual([])

    add('<table><tr><td>Ken Wong</td><td><span>陳大文</span></td></tr></table>')
    await settle()
    expect(loaded).toEqual(['Noto TC'])

    add('<h1>程式設計入門</h1>')
    loadFontsFor('en')
    await settle()
    expect(loaded).toEqual(['Noto TC'])
  })

  it('loads them when what it shows turns Chinese (a name in place of a dash)', async () => {
    const name = add('—').firstChild!
    loadFontsFor('en')
    await settle()
    name.nodeValue = '林老師'
    await settle()
    expect(loaded).toEqual(['Noto TC'])
  })

  it('loads them when the reader types Chinese into a field, not into a password’s', async () => {
    const form = add('<input id="filter"><input id="secret" type="password">')
    loadFontsFor('en')
    await settle()
    const type = (id: string, value: string) => {
      const field = form.querySelector<HTMLInputElement>(`#${id}`)!
      field.value = value
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    type('secret', '密碼')
    type('filter', 'Chan')
    await settle()
    expect(loaded).toEqual([])

    type('filter', '林 Chan')
    await settle()
    expect(loaded).toEqual(['Noto TC'])
  })

  it('loads them when a field comes into it holding Chinese (a name to edit)', async () => {
    loadFontsFor('en')
    await settle()
    // A field's value, which the page sets, is no text of the page's.
    const name = document.createElement('textarea')
    name.value = '林老師'
    const form = document.createElement('form')
    form.append(name)
    document.body.append(form)
    await settle()
    expect(loaded).toEqual(['Noto TC'])
  })

  it('turned English, loads them for the Chinese it still shows once its own words are redrawn, and not for those', async () => {
    const words = add('<nav>課程</nav>').firstChild as HTMLElement
    loadFontsFor('en')
    // The page redraws its words in English before the check, as Vue does in a microtask.
    queueMicrotask(() => (words.textContent = 'Courses'))
    await settle()
    expect(loaded).toEqual([])

    add('<h1>程式設計入門</h1>')
    loadFontsFor('zh-Hans')
    loadFontsFor('en')
    expect(loaded).toEqual([])
    await settle()
    expect(loaded).toEqual(['Noto SC', 'Noto TC'])
  })

  it('stops looking for Chinese once it is in Chinese, which loads its own script’s', async () => {
    loadFontsFor('en')
    loadFontsFor('zh-Hans')
    add('<p>陳大文</p>')
    await settle()
    expect(loaded).toEqual(['Noto SC'])
  })
})
