import { describe, expect, it } from 'vitest'
import tokensCss from './tokens.css?raw'
import elementCss from './element.css?raw'

// The type scale (styles/tokens.css, docs/CONVENTIONS.md "Type"): every size
// of text is a step of it, every strong weight one of its two, so that a page
// has a handful of sizes rather than fifteen, and Chinese, whose two smallest
// steps are a size larger and whose strong text is 500, is never set at 12 px
// nor made bold by a 600 its typeface does not have.
//
// The scan is of every style sheet, component and module in src, the
// templates' and the scripts' inline styles with them. What may be written
// otherwise is in EXCEPTIONS, each with why.

const sources = import.meta.glob<string>(
  ['/src/**/*.{vue,css,ts}', '!/src/**/*.spec.ts', '!/src/api/generated/**'],
  { query: '?raw', import: 'default', eager: true },
)

/** The sizes of the scale, as `var(--app-text-<step>)` names them. */
const STEPS = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', 'prose', 'mark']

/** A font-size of a token, or one relative to the text it is in (a heading in rendered Markdown, code in a line). */
const SIZE_OK = new RegExp(`^(?:var\\(--app-text-(?:${STEPS.join('|')})\\)|\\d*\\.?\\d+em|inherit)$`)
/** The two weights of the scale, and those every typeface has. */
const WEIGHT_OK = /^(?:var\(--app-weight-strong\)|var\(--app-heading-weight\)|400|500|normal|inherit)$/

/** What is let through, by file and the value it writes there, each with why. */
const EXCEPTIONS: { file: string; values: RegExp; why: string }[] = [
  {
    file: '/src/utils/printLayout.ts',
    values: /^(?:\d+(?:\.\d+)?pt|600|var\(--app-heading-weight, 700\))$/,
    why: 'a page laid out for paper, in points: it is printed, not read on a screen, and keeps its own sizes',
  },
  {
    file: '/src/components/preview/PdfView.vue',
    values: /^calc\(var\(--text-scale-factor\) \* var\(--font-height\)\)$/,
    why: "pdf.js's text layer, sized to lie exactly over the words drawn on the page's canvas",
  },
  {
    file: '/src/components/AgentAvatar.vue',
    values: /^calc\(var\(--agent-avatar-size\) (?:\* 0\.43|\/ 2)\)$/,
    why: "an agent's initials, drawn to the size of its square, whatever the language",
  },
  {
    file: '/src/views/course/members/components/JoinLinkFullscreen.vue',
    values: /^clamp\(\d+px, \d+(?:\.\d+)?vw, \d+px\)$/,
    why: 'a join code shown full screen to a room, sized to the screen it is projected on',
  },
]

/** Each `property: value` written in a source (a custom property is not one), with its file. */
function declarations(property: string): { file: string; value: string }[] {
  const re = new RegExp(`(?<![-\\w])${property}\\s*:\\s*([^;}"'\`\\n]+)`, 'g')
  const out: { file: string; value: string }[] = []
  for (const [file, text] of Object.entries(sources))
    for (const m of text.matchAll(re)) out.push({ file, value: m[1]!.trim().replace(/\s*!important$/, '') })
  return out
}

const excepted = (d: { file: string; value: string }) =>
  EXCEPTIONS.some((e) => e.file === d.file && e.values.test(d.value))

/** The custom properties a block of tokens.css sets, by name. */
function block(selector: string): Record<string, string> {
  const at = tokensCss.indexOf(`${selector} {`)
  expect(at, selector).toBeGreaterThanOrEqual(0)
  const body = tokensCss.slice(at, tokensCss.indexOf('\n}', at))
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]))
}

describe('the type scale', () => {
  it('reads every source', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(300)
    expect(declarations('font-size').length).toBeGreaterThan(700)
    // Style sheets as they are written, not the empty text a test is otherwise given for one (vite.config.ts).
    expect(sources['/src/styles/main.css']).toContain('.app-form-hint')
    expect(tokensCss).toContain('--app-text-xs')
  })

  it('has its steps, its leading, its strong weight and its room, in English', () => {
    const root = block(':root')
    expect(STEPS.filter((s) => s !== 'prose' && s !== 'mark').map((s) => root[`--app-text-${s}`])).toEqual([
      '12px',
      '13px',
      '14px',
      '16px',
      '18px',
      '24px',
      '32px',
      '40px',
    ])
    expect([root['--app-text-prose'], root['--app-text-mark']]).toEqual(['15px', '11px'])
    expect([root['--app-lh-ui'], root['--app-lh-text'], root['--app-lh-prose']]).toEqual(['1.5', '1.6', '1.7'])
    expect([root['--app-weight-strong'], root['--app-heading-weight']]).toEqual(['600', '600'])
    expect(['xs', 'sm', 'md', 'lg', 'xl', '2xl'].map((s) => root[`--app-space-${s}`])).toEqual([
      '4px',
      '8px',
      '12px',
      '16px',
      '24px',
      '32px',
    ])
  })

  it('sets Chinese no smaller than 13 px, with lines further apart and strong text in 500', () => {
    const zh = block('html:lang(zh)')
    expect([zh['--app-text-xs'], zh['--app-text-sm']]).toEqual(['13px', '14px'])
    expect([zh['--app-lh-ui'], zh['--app-lh-text'], zh['--app-lh-prose']]).toEqual(['1.6', '1.75', '1.85'])
    // Noto Sans is loaded in 400, 500 and 700 (styles/fonts-zh-*.ts): 600 would fall to 700.
    expect(zh['--app-weight-strong']).toBe('500')
    expect(zh['--app-heading-weight']).toBe('700')
    // The steps from md up, the prose's and the marks' are the same in every language.
    for (const s of ['md', 'lg', 'xl', '2xl', '3xl', '4xl', 'prose', 'mark']) expect(zh[`--app-text-${s}`]).toBeUndefined()
  })

  it('is every font-size the app writes', () => {
    const off = declarations('font-size')
      .filter((d) => !SIZE_OK.test(d.value) && !excepted(d))
      .map((d) => `${d.file}: font-size: ${d.value}`)
    expect(off).toEqual([])
  })

  it('gives strong text its weight, never a 600 Chinese has not got', () => {
    const off = declarations('font-weight')
      .filter((d) => !WEIGHT_OK.test(d.value) && !excepted(d))
      .map((d) => `${d.file}: font-weight: ${d.value}`)
    expect(off).toEqual([])
  })

  it('leaves the font shorthand to inherit only, which sets no size of its own', () => {
    const off = declarations('font')
      .filter((d) => d.value !== 'inherit')
      .map((d) => `${d.file}: font: ${d.value}`)
    expect(off).toEqual([])
  })

  it('names only tokens tokens.css defines', () => {
    const defined = new Set([...tokensCss.matchAll(/(--app-[\w-]+):/g)].map((m) => m[1]))
    const used = new Set<string>()
    for (const text of Object.values(sources))
      for (const m of text.matchAll(/var\((--app-(?:text|lh|weight|space)-[\w-]+)/g)) used.add(m[1]!)
    expect([...used].filter((t) => !defined.has(t))).toEqual([])
  })

  it('is Element Plus’s too', () => {
    const vars = Object.fromEntries(
      [...elementCss.matchAll(/(--el-font-size-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
    )
    expect(vars).toEqual({
      '--el-font-size-extra-small': 'var(--app-text-xs)',
      '--el-font-size-small': 'var(--app-text-sm)',
      '--el-font-size-base': 'var(--app-text-md)',
      '--el-font-size-medium': 'var(--app-text-lg)',
      '--el-font-size-large': 'var(--app-text-xl)',
      '--el-font-size-extra-large': 'var(--app-text-xl)',
    })
    for (const v of ['--el-tag-font-size', '--el-alert-title-font-size', '--el-badge-font-size'])
      expect(elementCss).toMatch(new RegExp(`${v}: var\\(--app-text-\\w+\\);`))
  })

  it('catches a size, a weight or a token that is not the scale’s', () => {
    expect(SIZE_OK.test('12px')).toBe(false)
    expect(SIZE_OK.test('var(--app-text-xs, 12px)')).toBe(false)
    expect(SIZE_OK.test('var(--app-text-xxl)')).toBe(false)
    expect(SIZE_OK.test('1rem')).toBe(false)
    expect(SIZE_OK.test('var(--app-text-sm)')).toBe(true)
    expect(SIZE_OK.test('0.88em')).toBe(true)
    expect(WEIGHT_OK.test('600')).toBe(false)
    expect(WEIGHT_OK.test('650')).toBe(false)
    expect(WEIGHT_OK.test('bold')).toBe(false)
    expect(WEIGHT_OK.test('var(--app-weight-strong, 600)')).toBe(false)
    expect(WEIGHT_OK.test('var(--app-weight-strong)')).toBe(true)
  })
})
