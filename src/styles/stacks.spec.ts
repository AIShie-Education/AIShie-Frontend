import { describe, expect, it } from 'vitest'

// The font stacks (docs/CONVENTIONS.md, Text). No stack names PMingLiU or
// SimSun, nor their kin (MingLiU, NSimSun, their Chinese names): they have no
// bold, and a browser makes a false one of them, smeared, in every heading.
// Only Windows has them, so a stack that names one, or that puts a face of
// the system's before Noto, shows it there and on no machine a test runs on:
// a browser there cannot report a face it does not have. So the stacks are
// read as written.
//
// A page in Chinese names first the Latin faces under names of their own
// (styles/fonts-latin.css), then Noto in its script's forms; a page in
// English names Noto TC before any Chinese face of the system's.

const raw = (files: Record<string, string>) =>
  Object.entries(files).map(([path, text]) => [path.replace(/^\//, ''), text] as const)

// Every style the app has, as written: its style sheets, its components'
// <style>, the CSS a script writes (the print layout's), and the loading
// screen's in index.html.
const sources = [
  ...raw(import.meta.glob<string>('/src/**/*.{css,vue}', { query: '?raw', import: 'default', eager: true })),
  ...raw(
    import.meta.glob<string>(['/src/**/*.ts', '!/src/**/*.spec.ts'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ),
  ...raw(import.meta.glob<string>('/index.html', { query: '?raw', import: 'default', eager: true })),
]
const tokens = sources.find(([path]) => path === 'src/styles/tokens.css')![1]
const latin = sources.find(([path]) => path === 'src/styles/fonts-latin.css')![1]

/**
 * Without its comments, which may name what a stack must not. Removed again
 * until none is left, so that a comment taken out cannot leave the halves of
 * another that join into a new one.
 */
function uncommented(text: string): string {
  let out = text
  for (let before = ''; before !== out; ) {
    before = out
    out = out.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
  }
  return out
}

/**
 * Every font declaration in a text, with its value: `font-family`, the
 * `font` shorthand, a custom property that holds a stack (`--app-font-sans`,
 * `--el-font-family`), and a script's `fontFamily`.
 */
function fontDeclarations(text: string): string[] {
  return [
    ...uncommented(text).matchAll(/(?<![\w-])(?:--[\w-]*font[\w-]*|font-family|font|fontFamily)\s*:\s*[^;{}]+/g),
  ].map((m) => m[0].trim())
}

/** PMingLiU and MingLiU (細明體, 新細明體), SimSun and NSimSun (宋体, 新宋体), and their -ExtB and _HKSCS. */
const NO_BOLD = /MingLiU|SimSun|細明體|宋体/i

/** A face of the system's that has Chinese, which a stack names only after Noto's. */
const SYSTEM_CHINESE =
  /^(?:PingFang|Hiragino|Heiti|STHeiti|Songti|STSong|Kaiti|STKaiti|Microsoft (?:JhengHei|YaHei)|DFKai|SimHei|KaiTi|FangSong|Source Han|Noto (?:Sans|Serif) CJK)|MingLiU|SimSun/i

/** The families of a stack, in order, unquoted. */
const families = (value: string) =>
  value
    .split(',')
    .map((f) => f.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)

/** The stacks a rule of tokens.css sets, by the rule's selector: its `--app-font-sans` and `--app-font-serif`. */
function stacks(selector: string): { sans: string[]; serif: string[] } {
  const rule = [...uncommented(tokens).matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => m[1]!.trim() === selector)
  expect(rule, `a rule ${selector} in tokens.css`).toBeDefined()
  const value = (name: string) => {
    const m = rule![2]!.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))
    expect(m, `${selector} sets ${name}`).not.toBeNull()
    return families(m![1]!)
  }
  return { sans: value('--app-font-sans'), serif: value('--app-font-serif') }
}

/** Where a family is in a stack, and where its first Chinese face of the system's is. */
function before(stack: string[], noto: string) {
  return { noto: stack.indexOf(noto), system: stack.findIndex((f) => SYSTEM_CHINESE.test(f)) }
}

describe('the font stacks', () => {
  it('are all read: tokens.css, the components, the print layout, index.html', () => {
    const paths = sources.map(([path]) => path)
    expect(paths).toEqual(
      expect.arrayContaining([
        'src/styles/tokens.css',
        'src/styles/main.css',
        'src/styles/fonts-latin.css',
        'src/utils/printLayout.ts',
        'index.html',
      ]),
    )
    expect(paths.filter((p) => p.endsWith('.vue')).length).toBeGreaterThan(100)
    expect(sources.flatMap(([, text]) => fontDeclarations(text)).length).toBeGreaterThan(50)
  })

  it.each(sources.filter(([, text]) => fontDeclarations(text).length))(
    '%s names no face without a bold (PMingLiU, SimSun)',
    (_, text) => {
      expect(fontDeclarations(text).filter((d) => NO_BOLD.test(d))).toEqual([])
    },
  )

  it('in Traditional Chinese begin with the Latin faces, then Noto TC', () => {
    const { sans, serif } = stacks('html:lang(zh-Hant)')
    expect(sans.slice(0, 2)).toEqual(['AIshie Latin', 'Noto Sans TC'])
    expect(serif.slice(0, 2)).toEqual(['AIshie Latin Serif', 'Noto Serif TC'])
  })

  it('in Simplified Chinese begin with the Latin faces, then Noto SC', () => {
    const { sans, serif } = stacks('html:lang(zh-Hans)')
    expect(sans.slice(0, 2)).toEqual(['AIshie Latin', 'Noto Sans SC'])
    expect(serif.slice(0, 2)).toEqual(['AIshie Latin Serif', 'Noto Serif SC'])
  })

  it('in English begin with Plex and Source Serif, and name Noto TC before any Chinese face of the system’s', () => {
    const { sans, serif } = stacks(':root')
    expect(sans[0]).toBe('IBM Plex Sans')
    expect(serif[0]).toBe('Source Serif 4')
    for (const [stack, noto] of [
      [sans, 'Noto Sans TC'],
      [serif, 'Noto Serif TC'],
    ] as const) {
      const at = before(stack, noto)
      expect(at.noto, `${noto} in ${stack.join(', ')}`).toBeGreaterThan(0)
      expect(at.system, `a Chinese face of the system's in ${stack.join(', ')}`).toBeGreaterThan(at.noto)
    }
  })

  it('a stack that does not is caught', () => {
    expect(
      fontDeclarations("--app-font-serif: 'Source Serif 4', 'PMingLiU', serif;").some((d) => NO_BOLD.test(d)),
    ).toBe(true)
    expect(fontDeclarations('h1 { font: 700 20px/1.2 SimSun, serif }').some((d) => NO_BOLD.test(d))).toBe(true)
    expect(fontDeclarations("{ fontFamily: '新細明體' }").some((d) => NO_BOLD.test(d))).toBe(true)
    expect(fontDeclarations('/* No stack names PMingLiU. */ font-family: inherit;')).toEqual(['font-family: inherit'])
    const old = families("'Source Serif 4', Georgia, 'Songti TC', 'PMingLiU', 'Noto Serif TC', serif")
    const at = before(old, 'Noto Serif TC')
    expect(at.system).toBeLessThan(at.noto)
  })
})

describe('the Latin faces of a Chinese page (fonts-latin.css)', () => {
  const ranges = [...uncommented(latin).matchAll(/unicode-range\s*:\s*([^;]+);/g)].map((m) => m[1]!.trim())

  /** Whether a range of the form `U+0000-00FF, U+2013` holds a character. */
  const holds = (range: string, char: string) => {
    const code = char.codePointAt(0)!
    return range.split(',').some((part) => {
      const [from, to = from] = part.trim().replace(/^U\+/i, '').split('-')
      return code >= parseInt(from!, 16) && code <= parseInt(to!, 16)
    })
  }

  it('are each limited to Latin letters, figures and their punctuation', () => {
    expect(ranges.length).toBe(4)
    for (const range of ranges) {
      // Latin-1 (with the dot of "CS101·A" and ×), the en dash, the bullet, the minus sign.
      for (const c of ['A', '9', '%', '·', '×', 'é', '–', '•', '−']) expect(holds(range, c), c).toBe(true)
      // Han and its punctuation, and the em dash Chinese doubles (「——」): Noto's.
      for (const c of ['中', '「', '」', '，', '。', '：', '（', '）', '、', '—', '“', '”', '…', '・'])
        expect(holds(range, c), c).toBe(false)
    }
  })
})
