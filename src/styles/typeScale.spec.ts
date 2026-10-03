import { describe, expect, it } from 'vitest'
import tokensCss from './tokens.css?raw'
import elementCss from './element.css?raw'
import elementPlusCss from 'element-plus/dist/index.css?raw'

// The type scale (styles/tokens.css, docs/CONVENTIONS.md "Type"): every size
// of text is a step of it, every strong weight one of its two, so that a page
// has a handful of sizes rather than fifteen, and Chinese, whose two smallest
// steps are a size larger and whose strong text is 500, is never set at 12 px
// nor made bold by a 600 its typeface does not have.
//
// The scan is of every style sheet, component and module in src, the
// templates' and the scripts' inline styles with them, however a size or a
// weight is written there: a declaration, in a style sheet or a string of CSS
// (`font-size: 12px`, in any case); a style object's key (`:style="{
// fontSize: '12px' }"`, `{ 'font-size': '12px' }`); an element's style
// (`el.style.fontSize = '12px'`, `setProperty('font-size', '12px')`); and a
// custom property that sizes or weighs text (`--el-tag-font-size: 11px`).
// The scale's own tokens are set in tokens.css alone. What may be written
// otherwise is in EXCEPTIONS, each with why. Element Plus's own small sizes
// are mapped onto the scale in element.css, and the last test checks that
// none is missed.

const sources = import.meta.glob<string>(
  ['/src/**/*.{vue,css,ts}', '!/src/**/*.spec.ts', '!/src/api/generated/**'],
  { query: '?raw', import: 'default', eager: true },
)
type Sources = Record<string, string>

/** The sizes of the scale, as `var(--app-text-<step>)` names them. */
const STEPS = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', 'prose', 'mark']
const STEP = new RegExp(`^var\\(--app-text-(?:${STEPS.join('|')})\\)$`)

/**
 * A size of the scale, or one relative to the text it is in: a heading in
 * rendered Markdown, from that text's size to twice it. Never smaller: the
 * text around may be Chinese at its smallest, 13 px, and 0.7em of that is
 * 9 px. Code in Markdown, a little smaller, is among EXCEPTIONS.
 */
function sizeOk(value: string): boolean {
  if (STEP.test(value) || value === 'inherit') return true
  const em = /^(\d*\.?\d+)em$/.exec(value)
  return !!em && Number(em[1]) >= 1 && Number(em[1]) <= 2
}
/** The two weights of the scale, and those every typeface has. */
const WEIGHT_OK = /^(?:var\(--app-weight-strong\)|var\(--app-heading-weight\)|400|500|normal|inherit)$/

interface Declaration {
  file: string
  value: string
  /** The selector of the rule it is in, where it is in a style sheet. */
  selector: string
}

/** What is let through, by file, the value it writes there and, where given, the rule it is in; each with why. */
const EXCEPTIONS: { file: string; values: RegExp; where?: RegExp; why: string }[] = [
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
    file: '/src/components/preview/PdfView.vue',
    values: /^(?:1|calc\(1 \/ var\(--min-font-size\)\))$/,
    where: /\.textLayer\)$/,
    why: "the factors pdf.js's text layer is scaled by (--min-font-size and its inverse), not sizes",
  },
  {
    file: '/src/components/AgentAvatar.vue',
    values: /^calc\(var\(--agent-avatar-size\) (?:\* 0\.43|\/ 2)\)$/,
    why: "an agent's initials, drawn to the size of its square, whatever the language",
  },
  {
    file: '/src/components/AgentAvatar.vue',
    values: /^0\.6em$/,
    where: /^\.agent-avatar__icon$/,
    why: "the glyph an agent's square shows in place of initials: an icon, not text",
  },
  {
    file: '/src/styles/main.css',
    values: /^0\.88em$/,
    where: /^\.markdown-body code$/,
    why: 'code in rendered Markdown, a little smaller than the words around it: Latin letters and figures in the monospace',
  },
  {
    file: '/src/styles/chat-prose.css',
    values: /^0\.86em$/,
    where: /^\.markdown-body\.chat-prose :not\(pre\) > code$/,
    why: 'code in a chat message, as in rendered Markdown',
  },
  {
    file: '/src/views/course/members/components/JoinLinkFullscreen.vue',
    values: /^clamp\(\d+px, \d+(?:\.\d+)?vw, \d+px\)$/,
    why: 'a join code shown full screen to a room, sized to the screen it is projected on',
  },
]

const camel = (property: string) => property.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())
const clean = (value: string) => value.trim().replace(/\s*!important$/i, '')

/** The selector of the rule that text at `at` is in, where that is a style sheet's (else whatever precedes it). */
function selectorAt(text: string, at: number): string {
  const open = text.lastIndexOf('{', at)
  if (open < 0) return ''
  const start = Math.max(text.lastIndexOf('}', open - 1), text.lastIndexOf('{', open - 1)) + 1
  return text
    .slice(start, open)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[\s\S]*<style[^>]*>/, '')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Each value a source gives `property` (a custom property is not one: customProperties), with its file and its rule. */
function declarations(property: string, from: Sources = sources): Declaration[] {
  // In a style sheet or a string of CSS, in any case.
  const css = new RegExp(`(?<![-\\w])${property}\\s*:\\s*([^;}"'\`\\n]+)`, 'gi')
  // In a script's or a template's style: an object's key, camel-cased or quoted, an assignment
  // to an element's style, or setProperty's first argument; its value quoted or not.
  const js = new RegExp(
    `(?:(?<![-\\w$])${camel(property)}\\s*(?::|=(?![=>]))|(['"\`])${property}\\1\\s*[:,])\\s*(?:(['"\`])(.*?)\\2|([^,;}\\n]+))`,
    'g',
  )
  const out: Declaration[] = []
  for (const [file, text] of Object.entries(from)) {
    // By where each is written, once: `font: inherit` is both a declaration and a key's form.
    const found = new Map<number, Declaration>()
    for (const m of text.matchAll(css))
      found.set(m.index!, { file, value: clean(m[1]!), selector: selectorAt(text, m.index!) })
    for (const m of text.matchAll(js))
      found.set(m.index!, { file, value: clean(m[3] ?? m[4]!), selector: selectorAt(text, m.index!) })
    out.push(...[...found].sort(([a], [b]) => a - b).map(([, d]) => d))
  }
  return out
}

/** Each custom property a source sets, written as CSS writes it or quoted as a script does, with its value. */
function customProperties(from: Sources = sources): (Declaration & { name: string })[] {
  const re = /(?<![\w(-])(['"`]?)(--[\w-]+)\1\s*[:,]\s*(?:(['"`])(.*?)\3|([^;}"'`\n]+))/g
  const out: (Declaration & { name: string })[] = []
  for (const [file, text] of Object.entries(from))
    for (const m of text.matchAll(re))
      out.push({ file, name: m[2]!, value: clean(m[4] ?? m[5]!), selector: selectorAt(text, m.index!) })
  return out
}

const excepted = (d: Declaration) =>
  EXCEPTIONS.some((e) => e.file === d.file && e.values.test(d.value) && (!e.where || e.where.test(d.selector)))

/** Each size written that is not the scale's. */
function sizesOff(from: Sources = sources): string[] {
  return declarations('font-size', from)
    .filter((d) => !sizeOk(d.value) && !excepted(d))
    .map((d) => `${d.file}: font-size: ${d.value}`)
}

/** Each weight written that is not one of the scale's. */
function weightsOff(from: Sources = sources): string[] {
  return declarations('font-weight', from)
    .filter((d) => !WEIGHT_OK.test(d.value) && !excepted(d))
    .map((d) => `${d.file}: font-weight: ${d.value}`)
}

/**
 * Each custom property that sets a size or a weight of text other than the
 * scale's (an Element Plus component's, `--el-tag-font-size: 11px`, in a
 * rule or a template's style alike), and each of the scale's own tokens set
 * anywhere but tokens.css (`--app-text-xs: 11px` in a component).
 */
function customOff(from: Sources = sources): string[] {
  return customProperties(from)
    .filter((d) => {
      if (/^--app-(?:text|lh|weight)-|^--app-heading-weight$/.test(d.name)) return d.file !== '/src/styles/tokens.css'
      if (/font-size|text-size/.test(d.name)) return !sizeOk(d.value) && !excepted(d)
      if (/font-weight/.test(d.name)) return !WEIGHT_OK.test(d.value) && !excepted(d)
      return false
    })
    .map((d) => `${d.file}: ${d.name}: ${d.value}`)
}

/** The custom properties a block of tokens.css sets, by name. */
function block(selector: string): Record<string, string> {
  const at = tokensCss.indexOf(`${selector} {`)
  expect(at, selector).toBeGreaterThanOrEqual(0)
  const body = tokensCss.slice(at, tokensCss.indexOf('\n}', at))
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]))
}

/** Each rule of a style sheet, its selectors one by one, written alike (Element Plus's are minified). */
function rules(css: string): { selectors: string[]; body: string }[] {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1]!.split(',').map((s) => s.trim().replace(/\s+/g, ' ').replace(/ ?> ?/g, '>')),
    body: m[2]!,
  }))
}

/** What Element Plus writes a small size into and the app leaves as it is: an icon's glyph. */
const ELEMENT_ICON =
  /(?:\.el-icon|__icon|-icon|__icon-btn|__arrow|__increase|__decrease|__nav-next|__nav-prev|__new-tab|\.is-icon-close)$/
/** Components of Element Plus the app does not use, and the rules that are theirs: once one is used, its small sizes are to be mapped. */
const ELEMENT_UNUSED: { tag: string; selectors: RegExp }[] = [
  { tag: 'carousel', selectors: /^\.el-carousel/ },
  { tag: 'cascader', selectors: /^\.el-cascader/ },
  { tag: 'color-picker', selectors: /^\.el-color-(?:picker|predefine)/ },
  { tag: 'mention', selectors: /^\.el-mention/ },
  { tag: 'menu', selectors: /^\.el-(?:sub-)?menu/ },
  { tag: 'transfer', selectors: /^\.el-transfer/ },
  { tag: 'upload', selectors: /^\.el-upload/ },
]
const used = (tag: string) => {
  const component = new RegExp(`<el-${tag}\\b|\\bEl${camel(`-${tag}`)}\\b`)
  return Object.values(sources).some((text) => component.test(text))
}

const PLANTED: Sources = {
  '/src/Planted.vue': `<template>
  <span :style="{ fontSize: '11px', fontWeight: 600 }">a</span>
  <b :style="{ 'font-size': '11px' }">b</b>
  <i :style="{ '--el-tag-font-size': '10px' }">c</i>
</template>
<script setup lang="ts">
el.style.fontSize = '12px'
el.style.setProperty('font-weight', '700')
</script>
<style scoped>
.a {
  --el-font-size-base: 12px;
  --el-tag-font-size: 11px;
  --app-text-xs: 11px;
  FONT-SIZE: 12px;
}
.b {
  font-size: 0.7em;
}
</style>`,
}

describe('the type scale', () => {
  it('reads every source', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(300)
    expect(declarations('font-size').length).toBeGreaterThan(700)
    // Style sheets as they are written, not the empty text a test is otherwise given for one (vite.config.ts).
    expect(sources['/src/styles/main.css']).toContain('.app-form-hint')
    expect(tokensCss).toContain('--app-text-xs')
    expect(elementPlusCss).toContain('.el-date-table')
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
    expect(sizesOff()).toEqual([])
  })

  it('gives strong text its weight, never a 600 Chinese has not got', () => {
    expect(weightsOff()).toEqual([])
    // Nor the browser's bold, to a <strong> or a table's heading with no rule of its own.
    const strong = rules(sources['/src/styles/main.css']!).find((r) => r.selectors.includes('strong'))
    expect(strong?.selectors).toEqual(['b', 'strong', 'th'])
    expect(strong?.body.trim()).toBe('font-weight: var(--app-weight-strong);')
  })

  it('sets a size or a weight of text in a custom property only to the scale’s, and the scale in tokens.css alone', () => {
    expect(customProperties().filter((d) => /font-size|text-size/.test(d.name)).length).toBeGreaterThan(20)
    expect(customOff()).toEqual([])
  })

  it('leaves the font shorthand to inherit only, which sets no size of its own', () => {
    const off = declarations('font')
      .filter((d) => d.value !== 'inherit')
      .map((d) => `${d.file}: font: ${d.value}`)
    expect(off).toEqual([])
  })

  it('names only tokens tokens.css defines', () => {
    const defined = new Set([...tokensCss.matchAll(/(--app-[\w-]+):/g)].map((m) => m[1]))
    const usedTokens = new Set<string>()
    for (const text of Object.values(sources))
      for (const m of text.matchAll(/var\((--app-(?:text|lh|weight|space)-[\w-]+)/g)) usedTokens.add(m[1]!)
    expect([...usedTokens].filter((t) => !defined.has(t))).toEqual([])
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

  it('maps every small size Element Plus writes into a rule of words onto the scale', () => {
    // A date picker's days, months and time panel, a switch's words inside it, a small control's
    // words, a tooltip's: Element Plus writes them at 12 or 13 px, which in Chinese is a step too small.
    const small = rules(elementPlusCss)
      .filter((r) => /(?<![-\w])font-size:\s*1[0-3]px/.test(r.body))
      .flatMap((r) => r.selectors)
    expect(small).toContain('.el-date-table')
    expect(small).toContain('.el-switch__core .el-switch__inner-wrapper')
    const mapped = new Set(
      rules(elementCss)
        .filter((r) => /(?<![-\w])font-size:\s*var\(--app-text-/.test(r.body))
        .flatMap((r) => r.selectors),
    )
    const left = small.filter(
      (s) => !mapped.has(s) && !ELEMENT_ICON.test(s) && !ELEMENT_UNUSED.some((u) => u.selectors.test(s)),
    )
    expect(left).toEqual([])
    // A component left out because the app does not use it is mapped once it does.
    expect(ELEMENT_UNUSED.filter((u) => used(u.tag)).map((u) => u.tag)).toEqual([])
    expect(used('date-picker') && used('switch')).toBe(true)
  })

  it('catches a size, a weight or a token that is not the scale’s, however it is written', () => {
    expect(sizeOk('12px')).toBe(false)
    expect(sizeOk('var(--app-text-xs, 12px)')).toBe(false)
    expect(sizeOk('var(--app-text-xxl)')).toBe(false)
    expect(sizeOk('1rem')).toBe(false)
    expect(sizeOk('0.7em')).toBe(false)
    expect(sizeOk('0.88em')).toBe(false)
    expect(sizeOk('3em')).toBe(false)
    expect(sizeOk('var(--app-text-sm)')).toBe(true)
    expect(sizeOk('1.15em')).toBe(true)
    expect(WEIGHT_OK.test('600')).toBe(false)
    expect(WEIGHT_OK.test('650')).toBe(false)
    expect(WEIGHT_OK.test('bold')).toBe(false)
    expect(WEIGHT_OK.test('var(--app-weight-strong, 600)')).toBe(false)
    expect(WEIGHT_OK.test('var(--app-weight-strong)')).toBe(true)
    // Each way a size or a weight may be written in a component, found and refused.
    expect(sizesOff(PLANTED)).toEqual([
      '/src/Planted.vue: font-size: 11px',
      '/src/Planted.vue: font-size: 11px',
      '/src/Planted.vue: font-size: 12px',
      '/src/Planted.vue: font-size: 12px',
      '/src/Planted.vue: font-size: 0.7em',
    ])
    expect(weightsOff(PLANTED)).toEqual(['/src/Planted.vue: font-weight: 600', '/src/Planted.vue: font-weight: 700'])
    expect(customOff(PLANTED)).toEqual([
      '/src/Planted.vue: --el-tag-font-size: 10px',
      '/src/Planted.vue: --el-font-size-base: 12px',
      '/src/Planted.vue: --el-tag-font-size: 11px',
      '/src/Planted.vue: --app-text-xs: 11px',
    ])
    // An exception holds only in its own file and rule.
    expect(sizesOff({ '/src/styles/main.css': '.markdown-body code {\n  font-size: 0.88em;\n}' })).toEqual([])
    expect(sizesOff({ '/src/styles/main.css': '.markdown-body .note {\n  font-size: 0.88em;\n}' })).toEqual([
      '/src/styles/main.css: font-size: 0.88em',
    ])
  })
})
