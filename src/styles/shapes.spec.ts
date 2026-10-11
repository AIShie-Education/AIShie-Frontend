import { describe, expect, it } from 'vitest'
import { PENDING } from './shapes.pending'
import tokensCss from './tokens.css?raw'
import elementCss from './element.css?raw'

// The shapes (styles/tokens.css, docs/CONVENTIONS.md "Shapes"), as aishie.app
// draws its own: an academic publication's straight corners and thin rules,
// not a generated app's rounded cards on shadows. Every box has a corner of
// 4 px or less (the app's is 2 px), and only a mark as wide as it is tall (a
// person's avatar, a dot) is round; nothing casts a shadow, but a line drawn
// as one (a field's edge, a ring, a one-sided rule); nothing is frosted; and
// no gradient fills anything, but the two that say something (below).
//
// The scan is of every style the app has, as typeScale.spec.ts reads them:
// its style sheets, its components' <style>, the CSS its templates and
// scripts write as strings and as style objects, and the loading screen's
// in index.html. It reads a corner however it is written: border-radius or
// any of its longhands, a custom property whose name holds "radius", in px,
// em or rem, through a token (which passes when the token does: var() is
// followed to what tokens.css, element.css or the file itself sets), in a
// calc(). A shadow is box-shadow, a custom property whose name holds
// "shadow", drop-shadow(), or a read of a shadow's token anywhere but where
// the tokens are set (tokens.css, element.css). In tokens.css, every corner
// is 4 px or less, and every shadow none.
//
// What is let through is in ROUND_MARKS and GRADIENTS, each with why. While
// design wave 3 is under way, a file not yet converted is listed in
// shapes.pending.ts, and the test fails on one listed that no longer offends,
// so that the lists only shrink.

const sources: Record<string, string> = {
  ...import.meta.glob<string>(
    ['/src/**/*.{vue,css,ts}', '!/src/**/*.spec.ts', '!/src/api/generated/**', '!/src/styles/shapes.pending.ts'],
    { query: '?raw', import: 'default', eager: true },
  ),
  ...import.meta.glob<string>('/index.html', { query: '?raw', import: 'default', eager: true }),
}
type Sources = Record<string, string>

/** The largest corner a box may have, in px. */
const MAX_RADIUS = 4
/** The widest ring a shadow may draw and still be a line: Element Plus's field's edge, a focus ring. */
const MAX_RING = 2
/** Where the shadows' tokens are set, and may be read. */
const SHADOW_TOKENS = ['/src/styles/tokens.css', '/src/styles/element.css']

/**
 * The marks that are round, each as wide as it is tall: by file and by the
 * whole selector list of the rule that rounds it. e2e/styleAudit.ts's
 * ROUND_MARKS names the same, as the page draws them, with Element Plus's own
 * (an avatar, a radio, a badge's dot, a timeline's point).
 */
const ROUND_MARKS: { file: string; selector: string; why: string }[] = [
  {
    file: '/src/components/sidebar/AccountMenu.vue',
    selector: '.account__avatar',
    why: 'the reader’s own avatar: a person, round as a person’s is, where an agent’s is square',
  },
  {
    file: '/src/components/AskableDot.vue',
    selector: '.askable-dot',
    why: 'the dot before an agent’s name that says whether it can be asked',
  },
  {
    file: '/src/views/course/activity/ActivityView.vue',
    selector: '.activity__dot',
    why: 'the activity’s live dot',
  },
  {
    file: '/src/components/chat/ChatPanel.vue',
    selector: '.chat-panel__dot',
    why: 'the dot on the chat’s history button for an unread answer',
  },
  {
    file: '/src/components/chat/ChatHistory.vue',
    selector: '.hist-row__dot',
    why: 'the dot before a conversation with an unread answer',
  },
]

/** The gradients that are not a fill: by file, the property they are in and, where given, the rule's selector. */
const GRADIENTS: { file: string; property: RegExp; selector?: RegExp; why: string }[] = [
  {
    file: '/src/layouts/CourseLayout.vue',
    property: /^(?:-webkit-)?mask-image$/,
    why: 'the course tabs’ fade at an end with more tabs past it: a mask, which says the strip scrolls, not a ground',
  },
  {
    file: '/src/components/preview/ImageView.vue',
    property: /^background-image$/,
    selector: /^\.image-view__stage$/,
    why: 'the checkerboard under an image in the file viewer, which shows what of it is transparent',
  },
]

const clean = (value: string) =>
  value
    .trim()
    .replace(/\s*!important$/i, '')
    .replace(/\s+/g, ' ')

/** A text with its CSS comments blanked out, each character kept in its place, so that what is found keeps its offset. */
const blankComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))

/**
 * A source as the scan reads it: its style (a style sheet whole, a
 * component's or index.html's <style> blocks), with comments blanked out,
 * and everything else (a template, a script), each in its place in the
 * text, the other blanked.
 */
function regions(file: string, text: string): { css: string; other: string } {
  if (file.endsWith('.css')) return { css: blankComments(text), other: '' }
  if (file.endsWith('.ts')) return { css: '', other: text }
  let css = ''
  let other = ''
  let at = 0
  for (const m of text.matchAll(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g)) {
    const start = m.index! + m[1]!.length
    const end = start + m[2]!.length
    other += text.slice(at, start)
    css += text.slice(at, start).replace(/[^\n]/g, ' ')
    css += blankComments(m[2]!)
    other += m[2]!.replace(/[^\n]/g, ' ')
    at = end
  }
  other += text.slice(at)
  return { css, other }
}

/** The selector of the rule that text at `at` is in, where that is a style sheet's. */
function selectorAt(text: string, at: number): string {
  const open = text.lastIndexOf('{', at)
  if (open < 0) return ''
  const start =
    Math.max(text.lastIndexOf('}', open - 1), text.lastIndexOf('{', open - 1), text.lastIndexOf(';', open - 1)) + 1
  return text.slice(start, open).trim().replace(/\s+/g, ' ')
}

interface Found {
  file: string
  property: string
  value: string
  selector: string
}

/**
 * Each declaration of a property in a source, however it is written: by the
 * pattern its name matches as CSS writes it, and as a script's style object
 * or an element's style names it (camel-cased).
 */
function declarationsIn(file: string, text: string, property: Property): Found[] {
  const { css, other } = regions(file, text)
  const out = new Map<number, Found>()
  // In a style sheet, over as many lines as the value takes.
  for (const m of css.matchAll(new RegExp(`(?<![-\\w])(${property.css.source})\\s*:\\s*([^;{}]+)`, 'gi')))
    out.set(m.index!, { file, property: m[1]!.toLowerCase(), value: clean(m[2]!), selector: selectorAt(css, m.index!) })
  // In a string of CSS in a template or a script, on one line.
  for (const m of other.matchAll(new RegExp(`(?<![-\\w])(${property.css.source})\\s*:\\s*([^;}"'\`\\n]+)`, 'gi')))
    out.set(m.index!, { file, property: m[1]!.toLowerCase(), value: clean(m[2]!), selector: '' })
  // A style object's key, camel-cased or quoted, an assignment to an element's style, or setProperty's
  // first argument; its value quoted or not.
  const js = new RegExp(
    `(?:(?<![-\\w$'"\`])(${property.js.source})\\s*(?::|=(?![=>]))|(['"\`])(${property.css.source})\\2\\s*[:,])\\s*(?:(['"\`])(.*?)\\4|([^,;}\\n]+))`,
    'g',
  )
  for (const m of other.matchAll(js)) {
    if (out.has(m.index!)) continue
    const name = (m[1] ?? m[3]!).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
    out.set(m.index!, { file, property: name, value: clean(m[5] ?? m[6]!), selector: '' })
  }
  return [...out].sort(([a], [b]) => a - b).map(([, d]) => d)
}

/** A property's name as CSS writes it, and as a script does (camel-cased). */
interface Property {
  css: RegExp
  js: RegExp
}
/** A corner's property: border-radius, any of its longhands, or a custom property whose name holds "radius". */
const RADIUS: Property = {
  css: /border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius|--[\w-]*radius[\w-]*/,
  js: /border(?:Top|Bottom|Start|End)?(?:Left|Right|Start|End)?Radius/,
}
/** A shadow's property: box-shadow, or a custom property whose name holds "shadow". */
const SHADOW: Property = { css: /box-shadow|--[\w-]*shadow[\w-]*/, js: /boxShadow/ }
/** Frosted glass. */
const BACKDROP: Property = { css: /backdrop-filter/, js: /backdropFilter/ }

/** The custom properties set in a text, by name: each value it is given. */
function customPropertiesIn(text: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const m of blankComments(text).matchAll(/(?<![\w(-])(['"`]?)(--[\w-]+)\1\s*:\s*([^;}"'`\n]+)/g)) {
    const values = out.get(m[2]!) ?? []
    values.push(clean(m[3]!))
    out.set(m[2]!, values)
  }
  return out
}
const TOKENS = new Map([...customPropertiesIn(tokensCss), ...customPropertiesIn(elementCss)])

/** What var(--name) may be in a file: what the file sets it to, else the tokens', else what any source sets it to. */
function candidates(name: string, file: string, from: Sources): string[] | undefined {
  const own = customPropertiesIn(from[file] ?? '').get(name)
  if (own) return own
  if (TOKENS.has(name)) return TOKENS.get(name)
  const anywhere = Object.values(from).flatMap((text) => customPropertiesIn(text).get(name) ?? [])
  return anywhere.length ? anywhere : undefined
}

/** Splits a value at the top level (outside parentheses) wherever `at` matches a character. */
function split(value: string, at: RegExp): string[] {
  const out: string[] = []
  let depth = 0
  let part = ''
  for (const c of value) {
    if (c === '(') depth++
    if (c === ')') depth--
    if (depth === 0 && at.test(c)) {
      if (part.trim()) out.push(part.trim())
      part = ''
    } else part += c
  }
  if (part.trim()) out.push(part.trim())
  return out
}

/** A var() as written: its name and its fallback. */
function parseVar(text: string): { name: string; fallback?: string } | undefined {
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]*))?\)$/.exec(text.trim())
  return m ? { name: m[1]!, fallback: m[2]?.trim() || undefined } : undefined
}

/** A corner, as far as the scan can read it: its largest in px, whether it is round (a percentage), and what could not be read. */
interface Corner {
  px: number
  round: boolean
  unread: string[]
}
const merge = (a: Corner, b: Corner): Corner => ({
  px: Math.max(a.px, b.px),
  round: a.round || b.round,
  unread: [...a.unread, ...b.unread],
})
const NONE: Corner = { px: 0, round: false, unread: [] }

/** A length in px: px as written, em and rem at 16 px, 0 without a unit. */
function lengthPx(text: string): number | undefined {
  const m = /^(-?\d*\.?\d+)(px|em|rem)?$/.exec(text)
  if (!m) return undefined
  if (!m[2] && Number(m[1]) !== 0) return undefined
  return Number(m[1]) * (m[2] === 'em' || m[2] === 'rem' ? 16 : 1)
}

/** The corner a value of border-radius (or a token of one) gives, var() and calc() followed. */
function corner(value: string, file: string, from: Sources = sources, depth = 0): Corner {
  if (depth > 10) return { ...NONE, unread: [value] }
  return split(value, /[\s/]/).reduce((sum, part) => {
    if (/^(?:inherit|initial|unset|revert|revert-layer)$/.test(part)) return sum
    const v = parseVar(part)
    if (v) {
      const values = candidates(v.name, file, from) ?? (v.fallback ? [v.fallback] : undefined)
      if (!values) return merge(sum, { ...NONE, unread: [part] })
      return values.reduce((s, c) => merge(s, corner(c, file, from, depth + 1)), sum)
    }
    const px = lengthPx(part)
    if (px !== undefined) return merge(sum, { ...NONE, px })
    const pct = /^(\d*\.?\d+)%$/.exec(part)
    if (pct) return merge(sum, { ...NONE, round: Number(pct[1]) > 0 })
    if (/^(?:calc|min|max|clamp)\(/.test(part)) {
      // Each var() in it as the largest it may be, each length in px: then the arithmetic.
      let failed = false
      const expression = part
        .replace(/var\(\s*--[\w-]+\s*(?:,[^()]*(?:\([^()]*\))?[^()]*)?\)/g, (inner) => {
          const c = corner(inner, file, from, depth + 1)
          if (c.round || c.unread.length) failed = true
          return String(c.px)
        })
        .replace(/(-?\d*\.?\d+)(px|em|rem)?(?![\w%])/g, (_, n: string, unit?: string) =>
          String(Number(n) * (unit === 'em' || unit === 'rem' ? 16 : 1)),
        )
        .replace(/\bcalc\(/g, '(')
      if (failed || !/^[\d.\s+\-*/(),]*$/.test(expression.replace(/\b(?:min|max|clamp)\(/g, '('))) {
        return merge(sum, { ...NONE, unread: [part] })
      }
      const clamp = (lo: number, x: number, hi: number) => Math.min(Math.max(lo, x), hi)
      const px = Number(new Function('min', 'max', 'clamp', `return (${expression})`)(Math.min, Math.max, clamp))
      return merge(sum, Number.isFinite(px) ? { ...NONE, px } : { ...NONE, unread: [part] })
    }
    return merge(sum, { ...NONE, unread: [part] })
  }, NONE)
}

/** Why a shadow's value is not a line drawn as one, or undefined where it is (none, a ring, an inset rule). */
function shadowFault(value: string, file: string, from: Sources = sources, depth = 0): string | undefined {
  if (/^(?:none|inherit|initial|unset|revert|revert-layer)$/.test(value)) return undefined
  if (depth > 10) return 'cannot be read'
  if (/var\(\s*--[\w-]*shadow/.test(value) && !SHADOW_TOKENS.includes(file)) return 'reads a shadow’s token'
  for (const layer of split(value, /,/)) {
    const whole = parseVar(layer)
    if (whole) {
      const values = candidates(whole.name, file, from) ?? (whole.fallback ? [whole.fallback] : undefined)
      if (!values) return 'cannot be read'
      for (const v of values) {
        const fault = shadowFault(v, file, from, depth + 1)
        if (fault) return fault
      }
      continue
    }
    const words = split(layer, /\s/)
    const inset = words.includes('inset')
    const lengths = words.map((w) => lengthPx(w)).filter((n): n is number => n !== undefined)
    if (lengths.length < 2 || lengths.length > 4) return 'cannot be read'
    const [x, y, blur = 0, spread = 0] = lengths
    if (blur !== 0) return 'casts a shadow (it is blurred)'
    if (!inset && (x !== 0 || y !== 0)) return 'casts a shadow (it is offset outside)'
    if (!inset && spread > MAX_RING) return `is a ring wider than ${MAX_RING} px`
  }
  return undefined
}

/** Each shape a source writes that the app does not draw, as `file: selector: property: value (why)`. */
function offences(from: Sources = sources): string[] {
  const out: string[] = []
  const say = (d: Found, why: string) =>
    out.push(`${d.file}: ${d.selector ? `${d.selector}: ` : ''}${d.property}: ${d.value} (${why})`)
  for (const [file, text] of Object.entries(from)) {
    for (const d of declarationsIn(file, text, RADIUS)) {
      const c = corner(d.value, file, from)
      if (c.unread.length) say(d, `a corner the scan cannot read: ${c.unread.join(', ')}`)
      else if (c.round && !ROUND_MARKS.some((m) => m.file === file && m.selector === d.selector))
        say(d, 'round, and not a mark listed in ROUND_MARKS')
      else if (c.px > MAX_RADIUS) say(d, `${c.px} px, over ${MAX_RADIUS}`)
    }
    for (const d of declarationsIn(file, text, SHADOW)) {
      const fault = shadowFault(d.value, file, from)
      if (fault) say(d, fault)
    }
    for (const d of declarationsIn(file, text, BACKDROP)) if (d.value !== 'none') say(d, 'frosted glass')
    const { css, other } = regions(file, text)
    for (const [region, inCss] of [
      [css, true],
      [other, false],
    ] as const) {
      for (const m of region.matchAll(/(?:repeating-)?(?:linear|radial|conic)-gradient\(/g)) {
        const before = region.slice(0, m.index!)
        const start = Math.max(before.lastIndexOf(';'), before.lastIndexOf('{'), before.lastIndexOf('}')) + 1
        const property = /([-\w]+)\s*:/.exec(region.slice(start, m.index!))?.[1]?.toLowerCase() ?? ''
        const selector = inCss ? selectorAt(region, m.index!) : ''
        const named = GRADIENTS.some(
          (g) => g.file === file && g.property.test(property) && (!g.selector || g.selector.test(selector)),
        )
        if (!named) say({ file, property, value: m[0], selector }, 'a gradient, and not one listed in GRADIENTS')
      }
      for (const m of region.matchAll(/drop-shadow\(/g))
        say(
          { file, property: 'filter', value: m[0], selector: inCss ? selectorAt(region, m.index!) : '' },
          'casts a shadow',
        )
    }
  }
  return out
}

/**
 * The entries of shapes.pending.ts: a file, all of whose offences wait, or a
 * file and a rule's selector (`/src/styles/main.css: .app-auth-page__card`),
 * where a file holds one rule that waits for a part of the wave and the rest
 * is held to the guard already.
 */
const PENDING_ENTRIES: string[] = [...PENDING.components, ...PENDING.screens, ...PENDING.chrome]
const pendingFor = (offence: string) => PENDING_ENTRIES.find((e) => offence.startsWith(`${e}: `))

const PLANTED: Sources = {
  '/src/Planted.vue': `<template>
  <span :style="{ borderRadius: '8px', boxShadow: '0 2px 8px rgb(0 0 0 / 20%)' }">a</span>
  <b :style="{ 'border-radius': '999px', '--chip-radius': '12px' }">b</b>
  <i style="border-top-left-radius: 6px; background: linear-gradient(red, blue)">c</i>
</template>
<script setup lang="ts">
el.style.borderRadius = '1rem'
el.style.setProperty('box-shadow', '0 0 0 4px red')
el.style.backdropFilter = 'blur(8px)'
</script>
<style scoped>
.a {
  border-radius: var(--app-radius-card, 16px);
  border-radius: var(--app-radius);
  border-radius: var(--planted-radius);
  border-radius: calc(var(--app-radius) + 6px);
  border-bottom-right-radius: 50%;
  --planted-radius: 10px;
}
.b {
  box-shadow:
    0 0 0 1px var(--app-line) inset,
    0 4px 12px rgb(0 0 0 / 10%);
  box-shadow: var(--app-shadow-pop);
  box-shadow: 0 1px 0 var(--app-line);
  box-shadow: inset 3px 0 0 var(--app-wait-fg);
  box-shadow: 0 0 0 2px var(--app-focus);
  filter: drop-shadow(0 1px 2px black);
  backdrop-filter: none;
  background-image: radial-gradient(circle, white, transparent);
}
.askable-dot {
  border-radius: 50%;
}
</style>`,
}

describe('the shapes', () => {
  it('reads every source', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(300)
    expect(sources['/index.html']).toContain('boot__retry')
    // Style sheets as they are written, not the empty text a test is otherwise given for one (vite.config.ts).
    expect(sources['/src/styles/main.css']).toContain('.app-card')
    const radii = Object.entries(sources).flatMap(([file, text]) => declarationsIn(file, text, RADIUS))
    expect(radii.length).toBeGreaterThan(150)
    expect(
      Object.entries(sources).flatMap(([file, text]) => declarationsIn(file, text, SHADOW)).length,
    ).toBeGreaterThan(20)
  })

  it('sets every corner in tokens.css at 4 px or less, and every shadow to none', () => {
    const set = customPropertiesIn(tokensCss)
    const radii = [...set].filter(([name]) => name.includes('radius'))
    expect(radii.map(([name]) => name)).toEqual(
      expect.arrayContaining(['--app-radius', '--app-radius-card', '--app-radius-control', '--app-radius-item']),
    )
    for (const [name, values] of radii)
      for (const v of values) {
        const c = corner(v, '/src/styles/tokens.css')
        expect(c, `${name}: ${v}`).toEqual({ px: c.px, round: false, unread: [] })
        expect(c.px, `${name}: ${v}`).toBeLessThanOrEqual(MAX_RADIUS)
      }
    expect(set.get('--app-radius')).toEqual(['2px'])
    expect(set.get('--app-radius-card')).toEqual(['0'])
    const shadows = [...set].filter(([name]) => name.includes('shadow'))
    expect(shadows.length).toBeGreaterThanOrEqual(3)
    for (const [name, values] of shadows) expect(values, name).toEqual(values.map(() => 'none'))
    // Element Plus's own, in both themes (its dark theme casts shadows of its own, which element.css undoes).
    const el = customPropertiesIn(elementCss)
    for (const name of ['--el-box-shadow', '--el-box-shadow-light', '--el-box-shadow-lighter', '--el-box-shadow-dark'])
      expect(el.get(name), name).toEqual(['none', 'none'])
    for (const name of ['--el-border-radius-base', '--el-border-radius-small', '--el-border-radius-round'])
      expect(el.get(name), name).toEqual(['var(--app-radius)'])
  })

  it('draws no corner over 4 px but a round mark’s, no shadow but a line, no frosted glass, and no gradient but the two named', () => {
    expect(offences().filter((o) => !pendingFor(o))).toEqual([])
  })

  it('lists in shapes.pending.ts only what still offends, once each, in one list', () => {
    const found = offences()
    expect(
      PENDING_ENTRIES.filter((e) => !found.some((o) => o.startsWith(`${e}: `))),
      'listed, but no longer offending',
    ).toEqual([])
    expect(
      PENDING_ENTRIES.filter((e, i) => PENDING_ENTRIES.indexOf(e) !== i),
      'listed twice',
    ).toEqual([])
    const file = (e: string) => e.split(': ')[0]!
    expect(
      PENDING_ENTRIES.filter((e) => !(file(e) in sources)),
      'listed, but no such source',
    ).toEqual([])
    // Never the files where the tokens are set, nor Markdown's: those are drawn as the site's already.
    for (const f of ['/src/styles/tokens.css', '/src/styles/element.css', '/src/styles/markdown-rich.css'])
      expect(PENDING_ENTRIES.map(file)).not.toContain(f)
  })

  it('names, of what it lets through, only rules and files that are there', () => {
    for (const m of ROUND_MARKS) {
      const rules = declarationsIn(m.file, sources[m.file] ?? '', RADIUS).filter((d) => d.selector === m.selector)
      expect(rules.length, `${m.file}: ${m.selector}`).toBeGreaterThan(0)
    }
    for (const g of GRADIENTS) expect(sources[g.file], g.file).toMatch(/-gradient\(/)
  })

  it('reads a corner through a token, a fallback, a calc() and a file’s own property', () => {
    const file = '/src/Planted.vue'
    expect(corner('var(--app-radius)', file)).toEqual({ px: 2, round: false, unread: [] })
    expect(corner('var(--app-radius-card, 16px)', file)).toEqual({ px: 0, round: false, unread: [] })
    expect(corner('var(--app-radius-item)', file).px).toBe(2)
    expect(corner('var(--nowhere, 8px)', file).px).toBe(8)
    expect(corner('var(--nowhere)', file).unread).toEqual(['var(--nowhere)'])
    expect(corner('calc(var(--app-radius) - 2px)', file).px).toBe(0)
    expect(corner('calc(var(--app-radius) + 6px)', file).px).toBe(8)
    expect(corner('0 var(--app-radius) var(--app-radius) 0', file).px).toBe(2)
    expect(corner('0.5rem', file).px).toBe(8)
    expect(corner('4px / 2px', file).px).toBe(4)
    expect(corner('50%', file).round).toBe(true)
    expect(corner('0%', file).round).toBe(false)
    expect(corner('var(--planted-radius)', '/src/Planted.vue', PLANTED).px).toBe(10)
  })

  it('tells a line drawn as a shadow from a shadow', () => {
    const file = '/src/Planted.vue'
    for (const ok of [
      'none',
      'inset 0 0 0 1px var(--app-line-strong)',
      'inset 3px 0 0 var(--app-wait-fg)',
      'inset 0 -1px 0 var(--app-line)',
      '0 0 0 1px var(--app-focus) inset',
      '0 0 0 2px var(--app-focus)',
      '0 0 0 1.5px var(--agent-avatar-ring, var(--el-bg-color))',
    ])
      expect(shadowFault(ok, file), ok).toBeUndefined()
    expect(shadowFault('0 0 0 3px var(--el-color-success-light-8)', file)).toMatch(/ring/)
    expect(shadowFault('0 1px 0 var(--app-line)', file)).toMatch(/offset/)
    expect(shadowFault('0 1px 4px rgb(0 0 0 / 14%)', file)).toMatch(/blurred/)
    expect(shadowFault('inset 0 0 4px red', file)).toMatch(/blurred/)
    expect(shadowFault('var(--app-shadow-pop)', file)).toMatch(/token/)
    expect(shadowFault('var(--app-shadow-pop)', '/src/styles/element.css')).toBeUndefined()
  })

  it('catches a corner, a shadow, frosted glass and a gradient, however they are written', () => {
    expect(offences(PLANTED)).toEqual([
      '/src/Planted.vue: border-radius: 8px (8 px, over 4)',
      '/src/Planted.vue: border-radius: 999px (999 px, over 4)',
      '/src/Planted.vue: --chip-radius: 12px (12 px, over 4)',
      '/src/Planted.vue: border-top-left-radius: 6px (6 px, over 4)',
      '/src/Planted.vue: border-radius: 1rem (16 px, over 4)',
      '/src/Planted.vue: .a: border-radius: var(--planted-radius) (10 px, over 4)',
      '/src/Planted.vue: .a: border-radius: calc(var(--app-radius) + 6px) (8 px, over 4)',
      '/src/Planted.vue: .a: border-bottom-right-radius: 50% (round, and not a mark listed in ROUND_MARKS)',
      '/src/Planted.vue: .a: --planted-radius: 10px (10 px, over 4)',
      // Round, but not in AskableDot.vue: a mark is let through in its own file alone.
      '/src/Planted.vue: .askable-dot: border-radius: 50% (round, and not a mark listed in ROUND_MARKS)',
      '/src/Planted.vue: box-shadow: 0 2px 8px rgb(0 0 0 / 20%) (casts a shadow (it is blurred))',
      '/src/Planted.vue: box-shadow: 0 0 0 4px red (is a ring wider than 2 px)',
      '/src/Planted.vue: .b: box-shadow: 0 0 0 1px var(--app-line) inset, 0 4px 12px rgb(0 0 0 / 10%) (casts a shadow (it is blurred))',
      '/src/Planted.vue: .b: box-shadow: var(--app-shadow-pop) (reads a shadow’s token)',
      '/src/Planted.vue: .b: box-shadow: 0 1px 0 var(--app-line) (casts a shadow (it is offset outside))',
      '/src/Planted.vue: backdrop-filter: blur(8px) (frosted glass)',
      '/src/Planted.vue: .b: background-image: radial-gradient( (a gradient, and not one listed in GRADIENTS)',
      '/src/Planted.vue: .b: filter: drop-shadow( (casts a shadow)',
      '/src/Planted.vue: background: linear-gradient( (a gradient, and not one listed in GRADIENTS)',
    ])
    // A round mark is let through only in its own file and rule.
    expect(
      offences({ '/src/components/AskableDot.vue': '<style>\n.askable-dot {\n  border-radius: 50%;\n}\n</style>' }),
    ).toEqual([])
    expect(
      offences({
        '/src/components/AskableDot.vue': '<style>\n.askable-dot__ring {\n  border-radius: 50%;\n}\n</style>',
      }),
    ).toEqual([
      '/src/components/AskableDot.vue: .askable-dot__ring: border-radius: 50% (round, and not a mark listed in ROUND_MARKS)',
    ])
    // A named gradient only in its own file and property.
    expect(
      offences({
        '/src/layouts/CourseLayout.vue': '<style>\n.x {\n  mask-image: linear-gradient(red, blue);\n}\n</style>',
      }),
    ).toEqual([])
    expect(
      offences({
        '/src/layouts/CourseLayout.vue': '<style>\n.x {\n  background: linear-gradient(red, blue);\n}\n</style>',
      }),
    ).toEqual([
      '/src/layouts/CourseLayout.vue: .x: background: linear-gradient( (a gradient, and not one listed in GRADIENTS)',
    ])
  })
})
