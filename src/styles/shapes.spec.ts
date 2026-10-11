import { describe, expect, it } from 'vitest'
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
// any of its longhands, -webkit- or -moz- prefixed or not, a custom property
// whose name holds "radius", in px, em or rem, through a token (which passes
// when the token does: var() is followed to what tokens.css, element.css or
// the file itself sets), in a calc(); in a script, camel-cased, quoted or
// not. A shadow is box-shadow (prefixed or not), text-shadow, a custom
// property whose name holds "shadow", drop-shadow(), or a read of a shadow's
// token anywhere but where the tokens are set (tokens.css, element.css); its
// lengths are read as a corner's are, and one the scan cannot read is
// reported, never passed. In tokens.css every corner is 4 px or less, and no
// shadow is set: nothing casts one.
//
// What is let through is in ROUND_MARKS and GRADIENTS, each with why.

const sources: Record<string, string> = {
  ...import.meta.glob<string>(['/src/**/*.{vue,css,ts}', '!/src/**/*.spec.ts', '!/src/api/generated/**'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
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
  // A style object's key, camel-cased or kebab-cased, quoted or not, an assignment to an element's style,
  // or setProperty's first argument; its value quoted or not.
  const js = new RegExp(
    `(?:(?<![-\\w$'"\`])(${property.js.source})\\s*(?::|=(?![=>]))|(['"\`])(${property.css.source}|${property.js.source})\\2\\s*[:,])\\s*(?:(['"\`])(.*?)\\4|([^,;}\\n]+))`,
    'g',
  )
  for (const m of other.matchAll(js)) {
    if (out.has(m.index!)) continue
    out.set(m.index!, { file, property: cssName(m[1] ?? m[3]!), value: clean(m[5] ?? m[6]!), selector: '' })
  }
  return [...out].sort(([a], [b]) => a - b).map(([, d]) => d)
}

/** A property's name as CSS writes it, from a script's (camel-cased, `WebkitBoxShadow` or `webkitBoxShadow`). */
function cssName(name: string): string {
  if (name.startsWith('-')) return name.toLowerCase()
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^(webkit|moz)-/, '-$1-')
}

/** A property's name as CSS writes it, and as a script does (camel-cased). */
interface Property {
  css: RegExp
  js: RegExp
}
/** A corner's property: border-radius or any of its longhands, prefixed or not, or a custom property whose name holds "radius". */
const RADIUS: Property = {
  css: /(?:-webkit-|-moz-)?border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius|--[\w-]*radius[\w-]*/,
  js: /(?:(?:[Ww]ebkit|Moz)B|b)order(?:Top|Bottom|Start|End)?(?:Left|Right|Start|End)?Radius/,
}
/** A shadow's property: box-shadow, prefixed or not, or a custom property whose name holds "shadow". */
const SHADOW: Property = {
  css: /(?:-webkit-|-moz-)?box-shadow|--[\w-]*shadow[\w-]*/,
  js: /(?:(?:[Ww]ebkit|Moz)B|b)oxShadow/,
}
/** A shadow cast by the letters. */
const TEXT_SHADOW: Property = { css: /text-shadow/, js: /textShadow/ }
/** Frosted glass, prefixed or not. */
const BACKDROP: Property = { css: /(?:-webkit-)?backdrop-filter/, js: /(?:[Ww]ebkitB|b)ackdropFilter/ }

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

/** A word of a shadow's layer, as far as the scan can read it: a length in px, its colour, or neither. */
type ShadowWord = { px: number } | 'colour' | 'unread'

/**
 * What a word of a shadow is: a length (px, em, rem, 0); a var() followed to
 * what it may be (a length, the largest it may be; a colour; neither, where
 * its values are of both kinds, or it is set nowhere and has no fallback); a
 * calc(), min(), max() or clamp() worked out as a corner's is; else the
 * colour (a name, a hex, rgb(), color-mix()). A value of more than one word
 * in a word's place cannot be read.
 */
function shadowWord(word: string, file: string, from: Sources, depth: number): ShadowWord {
  if (depth > 10 || split(word, /\s/).length > 1) return 'unread'
  const px = lengthPx(word)
  if (px !== undefined) return { px }
  const v = parseVar(word)
  if (v) {
    const values = candidates(v.name, file, from) ?? (v.fallback ? [v.fallback] : undefined)
    if (!values) return 'unread'
    const read = values.map((value) => shadowWord(clean(value), file, from, depth + 1))
    if (read.every((r) => r === 'colour')) return 'colour'
    const lengths = read.flatMap((r) => (typeof r === 'object' ? [r.px] : []))
    if (lengths.length < read.length) return 'unread'
    return { px: lengths.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)) }
  }
  if (/^(?:calc|min|max|clamp)\(/.test(word)) {
    const c = corner(word, file, from, depth + 1)
    return c.round || c.unread.length ? 'unread' : { px: c.px }
  }
  return 'colour'
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
    const read = words.filter((w) => w !== 'inset').map((w) => shadowWord(w, file, from, depth + 1))
    const lengths = read.flatMap((r) => (typeof r === 'object' ? [r.px] : []))
    if (read.includes('unread') || read.filter((r) => r === 'colour').length > 1) return 'cannot be read'
    if (lengths.length < 2 || lengths.length > 4) return 'cannot be read'
    const [x = 0, y = 0, blur = 0, spread = 0] = lengths
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
    for (const d of [...declarationsIn(file, text, SHADOW), ...declarationsIn(file, text, TEXT_SHADOW)]) {
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
  box-shadow: var(--planted-shadow);
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
  // Prefixed properties, a script's quoted camel-cased keys, a shadow cast by letters, and a shadow's lengths
  // the scan has to work out or cannot read.
  '/src/Prefixed.vue': `<template>
  <b :style="{ WebkitBorderRadius: '10px', '-webkit-box-shadow': '0 2px 4px red', textShadow: '0 1px 2px black' }">b</b>
</template>
<script setup lang="ts">
const look = { 'borderRadius': '12px', "boxShadow": '0 3px 0 red' }
el.style.webkitBoxShadow = '0 0 6px red'
el.style.setProperty('text-shadow', '1px 1px 0 red')
el.style.WebkitBackdropFilter = 'blur(2px)'
</script>
<style scoped>
.c {
  -webkit-border-radius: 8px;
  -moz-border-radius: 6px;
  -webkit-border-radius: var(--app-radius);
  -webkit-box-shadow: 0 2px 6px black;
  -webkit-backdrop-filter: blur(4px);
  text-shadow: 0 1px 0 white;
  text-shadow: none;
  box-shadow: 0 0 var(--nowhere) red;
  box-shadow: 0 0 0 calc(2px + 6px) red;
  box-shadow: 0 0 var(--planted-blur) red;
  box-shadow: 0 0 0 calc(var(--app-radius) - 1px) var(--app-focus);
  --planted-blur: 6px;
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
    // Only that the scan reads the sources at all: design wave 3 took about 70 corners out of the screens.
    expect(radii.length).toBeGreaterThan(100)
    expect(
      Object.entries(sources).flatMap(([file, text]) => declarationsIn(file, text, SHADOW)).length,
    ).toBeGreaterThan(20)
  })

  it('sets every corner in tokens.css at 4 px or less, and no shadow', () => {
    const set = customPropertiesIn(tokensCss)
    const radii = [...set].filter(([name]) => name.includes('radius'))
    expect(radii.map(([name]) => name)).toEqual(['--app-radius', '--app-radius-card'])
    for (const [name, values] of radii)
      for (const v of values) {
        const c = corner(v, '/src/styles/tokens.css')
        expect(c, `${name}: ${v}`).toEqual({ px: c.px, round: false, unread: [] })
        expect(c.px, `${name}: ${v}`).toBeLessThanOrEqual(MAX_RADIUS)
      }
    expect(set.get('--app-radius')).toEqual(['2px'])
    expect(set.get('--app-radius-card')).toEqual(['0'])
    // Nothing casts a shadow, so no token names one; one set there that casts one is refused as any is.
    expect([...set.keys()].filter((name) => name.includes('shadow'))).toEqual([])
    expect(
      offences({ '/src/styles/tokens.css': ':root {\n  --app-shadow-planted: 0 1px 3px rgb(0 0 0 / 10%);\n}' }),
    ).toEqual([
      '/src/styles/tokens.css: :root: --app-shadow-planted: 0 1px 3px rgb(0 0 0 / 10%) (casts a shadow (it is blurred))',
    ])
    // Element Plus's own, in both themes (its dark theme casts shadows of its own, which element.css undoes).
    const el = customPropertiesIn(elementCss)
    for (const name of ['--el-box-shadow', '--el-box-shadow-light', '--el-box-shadow-lighter', '--el-box-shadow-dark'])
      expect(el.get(name), name).toEqual(['none', 'none'])
    for (const name of ['--el-border-radius-base', '--el-border-radius-small', '--el-border-radius-round'])
      expect(el.get(name), name).toEqual(['var(--app-radius)'])
  })

  it('draws no corner over 4 px but a round mark’s, no shadow but a line, no frosted glass, and no gradient but the two named', () => {
    expect(offences()).toEqual([])
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
    expect(corner('var(--el-border-radius-base)', file).px).toBe(2)
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
      '0 0 0 calc(var(--app-radius) - 1px) var(--app-focus)',
      '0 0 0 min(1px, 0.25rem) currentColor',
    ])
      expect(shadowFault(ok, file), ok).toBeUndefined()
    expect(shadowFault('0 0 0 3px var(--el-color-success-light-8)', file)).toMatch(/ring/)
    expect(shadowFault('0 1px 0 var(--app-line)', file)).toMatch(/offset/)
    expect(shadowFault('0 1px 4px rgb(0 0 0 / 14%)', file)).toMatch(/blurred/)
    expect(shadowFault('inset 0 0 4px red', file)).toMatch(/blurred/)
    // A length in a var() or a calc() is worked out, a var() of a colour is the colour, and what is neither is
    // not read: never passed as though it were not there.
    expect(shadowFault('0 0 0 calc(2px + 6px) red', file)).toMatch(/ring/)
    expect(shadowFault('0 0 var(--planted-blur) red', '/src/Prefixed.vue', PLANTED)).toMatch(/blurred/)
    expect(shadowFault('0 var(--app-radius) 0 var(--app-line)', file)).toMatch(/offset/)
    for (const unread of [
      '0 0 var(--nowhere) red',
      '0 0 0 1px var(--nowhere)',
      '0 0 calc(var(--app-line) + 1px) red',
      '0 0 0 1px red blue',
      '0 0 0 1px var(--planted-pair)',
      'var(--nowhere)',
    ])
      expect(shadowFault(unread, '/src/Pair.vue', { '/src/Pair.vue': '--planted-pair: 2px 4px;' }), unread).toBe(
        'cannot be read',
      )
    // A shadow's token is read only where the tokens are set, whatever its name.
    expect(shadowFault('var(--planted-shadow)', file)).toMatch(/token/)
    expect(shadowFault('0 0 0 1px red, var(--el-box-shadow-light)', file)).toMatch(/token/)
    const tokens = { '/src/styles/element.css': ':root {\n  --planted-shadow: none;\n}' }
    expect(shadowFault('var(--planted-shadow)', '/src/styles/element.css', tokens)).toBeUndefined()
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
      '/src/Planted.vue: .b: box-shadow: var(--planted-shadow) (reads a shadow’s token)',
      '/src/Planted.vue: .b: box-shadow: 0 1px 0 var(--app-line) (casts a shadow (it is offset outside))',
      '/src/Planted.vue: backdrop-filter: blur(8px) (frosted glass)',
      '/src/Planted.vue: .b: background-image: radial-gradient( (a gradient, and not one listed in GRADIENTS)',
      '/src/Planted.vue: .b: filter: drop-shadow( (casts a shadow)',
      '/src/Planted.vue: background: linear-gradient( (a gradient, and not one listed in GRADIENTS)',
      // Prefixed, quoted camel-cased keys, letters' shadows, lengths in a var() or a calc(), and one not read.
      '/src/Prefixed.vue: -webkit-border-radius: 10px (10 px, over 4)',
      '/src/Prefixed.vue: border-radius: 12px (12 px, over 4)',
      '/src/Prefixed.vue: .c: -webkit-border-radius: 8px (8 px, over 4)',
      '/src/Prefixed.vue: .c: -moz-border-radius: 6px (6 px, over 4)',
      '/src/Prefixed.vue: -webkit-box-shadow: 0 2px 4px red (casts a shadow (it is blurred))',
      '/src/Prefixed.vue: box-shadow: 0 3px 0 red (casts a shadow (it is offset outside))',
      '/src/Prefixed.vue: -webkit-box-shadow: 0 0 6px red (casts a shadow (it is blurred))',
      '/src/Prefixed.vue: .c: -webkit-box-shadow: 0 2px 6px black (casts a shadow (it is blurred))',
      '/src/Prefixed.vue: .c: box-shadow: 0 0 var(--nowhere) red (cannot be read)',
      '/src/Prefixed.vue: .c: box-shadow: 0 0 0 calc(2px + 6px) red (is a ring wider than 2 px)',
      '/src/Prefixed.vue: .c: box-shadow: 0 0 var(--planted-blur) red (casts a shadow (it is blurred))',
      '/src/Prefixed.vue: text-shadow: 0 1px 2px black (casts a shadow (it is blurred))',
      '/src/Prefixed.vue: text-shadow: 1px 1px 0 red (casts a shadow (it is offset outside))',
      '/src/Prefixed.vue: .c: text-shadow: 0 1px 0 white (casts a shadow (it is offset outside))',
      '/src/Prefixed.vue: -webkit-backdrop-filter: blur(2px) (frosted glass)',
      '/src/Prefixed.vue: .c: -webkit-backdrop-filter: blur(4px) (frosted glass)',
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
