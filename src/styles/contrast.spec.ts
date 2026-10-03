import { describe, expect, it } from 'vitest'

// The palette's promises (styles/tokens.css), checked on the values as they
// are written, in the light theme (:root) and the dark one (html.dark over
// it): every pairing of text and the ground it is drawn on meets WCAG AA,
// 4.5:1, and a control's edge and the focus ring 3:1; the three inks are
// three steps, not two; each pill's colour is a hue of its own; and every
// colour is used and decided for the dark theme too. Element Plus's grounds
// (styles/element.css) are read beside them: a row or an option it lays
// under the app's text on hover is a ground that text must read on as well.
//
// The grounds and the pills are read from the style sheets, not listed here,
// so that one added to them is measured the day it is: each `--app-<x>-bg`
// is a pill, whose text is `--app-<x>-fg`; and every colour of the palette
// is a ground, every fill of Element Plus's and the palest step of each of
// its colours with them, except those NOT_GROUNDS names as something else
// (an ink, a line, an edge, a mark). The placeholder's ink, the one ink that
// does not read on every ground, is measured where the app writes in it:
// each rule that does names its grounds in PLACEHOLDER_INK.

// The style sheets are read from disk with Node's fs, imported by a name the
// app's types (the browser's) do not resolve: a style sheet imported into a
// test is an empty one.
interface Fs {
  readFileSync(path: string, encoding: 'utf8'): string
  readdirSync(path: string): string[]
  statSync(path: string): { isDirectory(): boolean }
}
const NODE_FS: string = 'node:fs'
const fs = (await import(/* @vite-ignore */ NODE_FS)) as Fs
const here = decodeURIComponent(import.meta.url.replace(/^file:\/\//, '').replace(/\/[^/]*$/, ''))
const src = here.replace(/\/styles$/, '')
const tokensCss = fs.readFileSync(`${here}/tokens.css`, 'utf8')
const elementCss = fs.readFileSync(`${here}/element.css`, 'utf8')

/** The files that paint with the palette (.vue, .ts, .css; Element Plus's mapping among them), tests and tokens.css left out, by their path from src. */
const SOURCES: { path: string; text: string }[] = []
const walk = (dir: string) => {
  for (const name of fs.readdirSync(dir)) {
    const path = `${dir}/${name}`
    if (fs.statSync(path).isDirectory()) walk(path)
    else if (/\.(vue|ts|css)$/.test(name) && !name.endsWith('.spec.ts') && path !== `${here}/tokens.css`)
      SOURCES.push({ path: path.slice(src.length + 1), text: fs.readFileSync(path, 'utf8') })
  }
}
walk(src)

/** Each top-level rule `selector { … }` of a style sheet, comments taken out; nested rules (@media) are left out. */
function rules(css: string): [string, string][] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: [string, string][] = []
  let depth = 0
  let start = 0
  let selector = ''
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) {
        selector = text.slice(start, i).trim()
        start = i + 1
      }
      depth++
    } else if (text[i] === '}') {
      depth--
      if (depth === 0) {
        out.push([selector, text.slice(start, i)])
        start = i + 1
      }
    }
  }
  return out
}

/** Every rule of a style sheet at any depth (inside @media too), its selector on one line and its own declarations. */
function everyRule(css: string): [string, string][] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: [string, string][] = []
  const open: { selector: string; body: string }[] = []
  let chunk = ''
  for (const c of text) {
    if (c === '{') {
      open.push({ selector: chunk.trim().replace(/\s+/g, ' '), body: '' })
      chunk = ''
    } else if (c === '}') {
      const rule = open.pop()
      if (rule) out.push([rule.selector, rule.body + chunk])
      chunk = ''
    } else if (c === ';') {
      if (open.length) open[open.length - 1].body += `${chunk};`
      chunk = ''
    } else chunk += c
  }
  return out
}

/** The custom properties a rule's body declares, by name without the dashes. */
function declarations(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

function declared(selector: string): Record<string, string> {
  return Object.assign(
    {},
    ...[tokensCss, elementCss].flatMap((css) =>
      rules(css)
        .filter(([s]) => s === selector)
        .map(([, body]) => declarations(body)),
    ),
  )
}

const ROOT = declared(':root')
const DARK = declared('html.dark')
const THEMES = { light: ROOT, dark: { ...ROOT, ...DARK } } as const
type Theme = keyof typeof THEMES

/** A custom property's value in a theme, var() followed. */
function resolved(theme: Theme, name: string): string | undefined {
  const props = THEMES[theme]
  let value = props[name]
  for (let hops = 0; value?.startsWith('var('); hops++) {
    if (hops > 10) throw new Error(`--${name} refers to itself`)
    value = props[/^var\(--([a-z0-9-]+)/.exec(value)![1]]
  }
  return value
}
const isColour = (value: string | undefined) => !!value && /^#[0-9a-f]{6}$/i.test(value)

/** A custom property's colour in a theme, var() followed; '#rrggbb'. */
function colour(theme: Theme, name: string): string {
  const value = resolved(theme, name)
  if (!isColour(value)) throw new Error(`--${name} is not a colour in the ${theme} theme: ${value}`)
  return value!.toLowerCase()
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

/** WCAG 2's relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** CIE LCh's chroma and hue angle (D65), for telling hues apart. */
function chromaHue(hex: string): { chroma: number; hue: number } {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const A = 500 * (f(x) - f(y))
  const B = 200 * (f(y) - f(z))
  return { chroma: Math.hypot(A, B), hue: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}

/** The pills, by the x of each `--app-<x>-bg` and `--app-<x>-fg` in tokens.css: its ground and its text. */
const PILLS = [...new Set(Object.keys(ROOT).flatMap((k) => /^app-(.+)-[bf]g$/.exec(k)?.[1] ?? []))]

/**
 * The colours of the palette that are not a ground, and what each is instead: every other colour in
 * tokens.css, and every fill and palest step of Element Plus's in element.css, is a ground, measured
 * under every ink. A pill's text, `--app-<x>-fg`, is not one either.
 */
const NOT_GROUNDS: Record<string, string> = {
  'app-ink': 'text',
  'app-ink-2': 'what is secondary to it',
  'app-ink-3': 'the meta beside it',
  'app-ink-placeholder': "a field's placeholder, and the quiet text in PLACEHOLDER_INK",
  'app-ink-disabled': "a disabled control's text, which WCAG holds to no ratio",
  'app-indigo': "a link's text, and a primary button's ground, under --app-on-indigo",
  'app-indigo-dark': "a primary button's ground, hovered or pressed, under --app-on-indigo",
  'app-on-indigo': 'text on the indigo',
  'app-wordmark': "the wordmark's letters, a logotype",
  'app-light': "the warm dot on the i, an agent's light and the chat's spinner: no text is drawn on it",
  'app-light-halo': 'the halo round the light, in the mark: no text is drawn on it',
  'app-line': 'a line between things',
  'app-line-soft': 'a softer line, between the rows of a list',
  'app-line-strong': "a stronger line, under a table's headings",
  'app-indigo-line': "an indigo line: a quotation's rule, a hovered button's edge",
  'app-control-border': "a control's edge, 3:1",
  'app-control-border-hover': "a control's edge, hovered",
  'app-focus': 'the focus ring, 3:1',
}

/**
 * Element Plus's deepest fills, and why neither the meta's ink nor a pill's text is written on them:
 * the first two inks and the indigo are measured on them as on every ground; the third ink and a
 * pill's text are not.
 */
const DEEP_FILLS: Record<string, string> = {
  'el-fill-color-dark':
    "an avatar's tile under the first ink, a bar's track in the grading scheme, a text button while pressed",
  'el-fill-color-darker': "a skeleton's shimmer, and the edge of a date picker's button",
}

/**
 * Every colour of a theme's palette: the app's (tokens.css), Element Plus's fills and the palest step
 * of each of its colours (a tag's, an alert's or a chosen item's ground). One that is another of them
 * by name (`var(--x)`) is measured as the one it names.
 */
function palette(theme: Theme): string[] {
  const props = THEMES[theme]
  const names = Object.keys(props).filter(
    (k) => /^(app-|el-fill-color|el-color-[a-z]+-light-9$)/.test(k) && isColour(resolved(theme, k)),
  )
  return names.filter((k) => !names.includes(/^var\(--([a-z0-9-]+)\)$/.exec(props[k])?.[1] ?? ''))
}

/** The grounds text is drawn on, in a theme: the page and its second shade, a card, what floats, a field, the fills, the tints and the pills' grounds. */
function grounds(theme: Theme): string[] {
  return palette(theme).filter((k) => !(k in NOT_GROUNDS) && !PILLS.some((p) => k === `app-${p}-fg`))
}

/**
 * Every rule of the app that writes in the placeholder's ink, by its file (from src) and selector, and
 * what it writes on: its grounds, each measured below, or what it is, a separator (a dot, or a dash
 * whose words are a screen reader's) or an icon (a chevron), which says nothing a reader could miss.
 * That ink reads at AA on a field, a card, the page and the lightest fill, not on a hovered row, a
 * chosen one, a pill's ground or the ground's second shade: text drawn there takes the third ink, as a
 * permission's key does on a changed row (the waiting pill's ground) and on a hovered one. A rule that
 * writes in it and is not named here fails, as does a name here that no rule has any more.
 */
const PLACEHOLDER_INK: Record<string, string[] | 'a separator' | 'an icon'> = {
  'components/chat/ChatComposer.vue: .chat-composer__hint': ['app-field'],
  'components/chat/ChatComposer.vue: .chat-composer__count': ['app-field'],
  // The chat's panel is a card, and its log of an agent's conversations a drawer.
  'components/chat/ChatPane.vue: .chat-pane__notice-sub': ['app-card', 'app-overlay'],
  // A proposal's tool name, under its title on the page.
  'views/course/actions/ActionView.vue: .action-view__code': ['app-ground'],
  // "By points", in a row of the grading scheme, hovered too.
  'views/course/scheme/components/SchemeTree.vue: .st-muted': ['app-card', 'el-fill-color-lighter'],
  // "No grade", in a student's list of grades (the class's gradebook on a phone).
  'views/course/grades/components/StudentGradeList.vue: .sgl__none': ['app-card'],
  // The dot between a conversation's course and its agent, each in an ink of its own.
  'components/chat/ChatHistory.vue: .hist-row__where': 'a separator',
  'views/course/grades/components/GradeMatrix.vue: .matrix__none': 'a separator',
  'views/course/materials/DocumentView.vue: .doc-content__dot': 'a separator',
  'views/course/materials/components/VersionHistory.vue: .version-item__dot': 'a separator',
  'views/course/materials/components/TextVersionPane.vue: .text-pane__dot': 'a separator',
  'views/course/materials/components/TextVersionPane.vue: .text-pane__source + .text-pane__pages::before':
    'a separator',
  'views/course/agents/components/AgentList.vue: .agent-row__dot': 'a separator',
  'views/course/grades/GradesView.vue: .grades-list__chev': 'an icon',
  'views/course/materials/MaterialsView.vue: .material-row__chevron': 'an icon',
  'views/course/grades/components/StudentGradeList.vue: .sgl__chev': 'an icon',
  'views/course/overview/components/AttentionCard.vue: .attention__go': 'an icon',
  'views/account/AgentsView.vue: .agents-item__chevron': 'an icon',
}

/** Each rule of the app's own style that writes in the placeholder's ink, as PLACEHOLDER_INK names it. */
function placeholderRules(): string[] {
  const out: string[] = []
  for (const { path, text } of SOURCES) {
    const styles = path.endsWith('.vue')
      ? [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1])
      : path.endsWith('.css')
        ? [text]
        : []
    for (const css of styles)
      for (const [selector, body] of everyRule(css))
        if (/(^|;)\s*color\s*:[^;]*var\(--(el-text-color-placeholder|app-ink-placeholder)\b/.test(body))
          out.push(`${path}: ${selector}`)
  }
  return out
}

/** The grounds the placeholder's ink is drawn on: a field's, and those PLACEHOLDER_INK names. */
const PLACEHOLDER_GROUNDS = [
  ...new Set(['app-field', ...Object.values(PLACEHOLDER_INK).flatMap((g) => (Array.isArray(g) ? g : []))]),
]

type Pair = [fg: string, bg: string, min: number]
function pairs(theme: Theme): Pair[] {
  const all = grounds(theme)
  const out: Pair[] = []
  // The first two inks, and the indigo of a link or a chosen tab, on every ground.
  for (const ink of ['app-ink', 'app-ink-2', 'app-indigo']) for (const bg of all) out.push([ink, bg, 4.5])
  // The third ink, and each pill's text, outlined (plain) on whatever it lies on: on every ground but
  // the deepest fills, a hovered row, a changed one (the waiting pill's ground) and another pill's included.
  for (const ink of ['app-ink-3', ...PILLS.map((p) => `app-${p}-fg`)])
    for (const bg of all) if (!(bg in DEEP_FILLS)) out.push([ink, bg, 4.5])
  // The placeholder's ink, where it is drawn.
  for (const bg of PLACEHOLDER_GROUNDS) out.push(['app-ink-placeholder', bg, 4.5])
  // What is written on the indigo, a primary button, hovered too.
  out.push(['app-on-indigo', 'app-indigo', 4.5], ['app-on-indigo', 'app-indigo-dark', 4.5])
  // A control's edge, on a card, the page or a popover, and the focus ring around anything: 3:1.
  for (const bg of ['app-ground', 'app-card', 'app-overlay']) out.push(['app-control-border', bg, 3])
  for (const bg of all) out.push(['app-focus', bg, 3])
  return out
}

describe.each(['light', 'dark'] as const)('the %s theme', (theme) => {
  it.each(pairs(theme))('--%s on --%s reads at %s:1 or more', (fg, bg, min) => {
    // Not rounded: 4.495:1 is under 4.5.
    const ratio = contrast(colour(theme, fg), colour(theme, bg))
    expect(ratio, `${colour(theme, fg)} on ${colour(theme, bg)}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min)
  })

  it('reads every ground from the style sheets, a pill’s and a hovered row’s among them', () => {
    const all = grounds(theme)
    expect(all).toEqual(
      expect.arrayContaining([
        'app-ground',
        'app-ground-2',
        'app-card',
        'app-overlay',
        'app-field',
        'app-indigo-tint',
        ...PILLS.map((p) => `app-${p}-bg`),
        'el-fill-color-lighter',
        'el-fill-color-light',
        'el-fill-color',
        'el-color-primary-light-9',
      ]),
    )
    // An alias is measured as what it names, once: a field's fill is the field, a warning's ground the waiting pill's.
    expect(all).not.toContain('el-fill-color-blank')
    expect(all).not.toContain('el-color-warning-light-9')
    expect(all.filter((k) => k.startsWith('app-ink') || k.endsWith('-fg'))).toEqual([])
  })

  it('has three inks a reader tells apart: the third is a step below the second, as the second is below the first', () => {
    // 1.28:1 between the second and third, before, and the meta text of a list read as its body.
    expect(contrast(colour(theme, 'app-ink'), colour(theme, 'app-ink-2'))).toBeGreaterThanOrEqual(1.4)
    expect(contrast(colour(theme, 'app-ink-2'), colour(theme, 'app-ink-3'))).toBeGreaterThanOrEqual(1.5)
    // On a card, each reads less strongly than the one before; the placeholder's is quieter still.
    const step = (name: string) => contrast(colour(theme, name), colour(theme, 'app-card'))
    expect(step('app-ink')).toBeGreaterThan(step('app-ink-2'))
    expect(step('app-ink-2')).toBeGreaterThan(step('app-ink-3'))
    expect(step('app-ink-3')).toBeGreaterThan(step('app-ink-placeholder'))
  })

  it('gives each pill a hue of its own, 30° apart at least, so that none is taken for another; only the neutral one has none', () => {
    const pills = PILLS.map((p) => [p, chromaHue(colour(theme, `app-${p}-fg`))] as const)
    const hued = pills.filter(([, c]) => c.chroma > 15)
    expect(hued.map(([p]) => p)).toEqual(expect.arrayContaining(['wait', 'done', 'danger']))
    // A second pill with little or no hue would be taken for the neutral one.
    expect(pills.filter(([, c]) => c.chroma <= 15).map(([p]) => p)).toEqual(['neutral'])
    for (const [i, [p, a]] of hued.entries())
      for (const [q, b] of hued.slice(i + 1)) {
        const apart = Math.min(Math.abs(a.hue - b.hue), 360 - Math.abs(a.hue - b.hue))
        expect(apart, `${p} and ${q}`).toBeGreaterThanOrEqual(30)
      }
  })

  it('repeats in each -rgb triplet the colour it names', () => {
    const props = THEMES[theme]
    const triplets = Object.keys(props).filter((k) => k.startsWith('el-color-') && k.endsWith('-rgb'))
    expect(triplets.length).toBeGreaterThanOrEqual(5)
    for (const k of triplets) {
      if (props[k].startsWith('var(')) continue
      const named = colour(theme, k.slice(0, -'-rgb'.length))
      expect(props[k].split(/\s*,\s*/).map(Number), k).toEqual(rgb(named))
    }
  })
})

describe('the palette', () => {
  const colours = Object.entries(ROOT)
    .filter(([k, v]) => k.startsWith('app-') && /^#[0-9a-f]{6}$/i.test(v))
    .map(([k]) => k)

  it('is read', () => {
    expect(colours).toContain('app-ink-3')
    expect(colours.length).toBeGreaterThan(30)
    expect(SOURCES.length).toBeGreaterThan(100)
  })

  it('decides every colour for the dark theme too, and the dark theme has none the light one lacks', () => {
    expect(colours.filter((k) => !(k in DARK))).toEqual([])
    expect(Object.keys(DARK).filter((k) => k.startsWith('app-') && !(k in ROOT))).toEqual([])
  })

  it('has no colour nobody paints with', () => {
    const all = SOURCES.map((f) => f.text).join('\n')
    expect(colours.filter((k) => !new RegExp(`var\\(--${k}[,)\\s]`).test(all))).toEqual([])
  })

  it('gives every pill its ground and its text, in both themes', () => {
    expect(PILLS).toEqual(expect.arrayContaining(['wait', 'done', 'danger', 'neutral']))
    const unpaired = PILLS.flatMap((p) => [`app-${p}-bg`, `app-${p}-fg`]).filter((k) => !isColour(ROOT[k]))
    expect(unpaired, 'a pill’s ground without its text, or its text without its ground').toEqual([])
  })

  it('names, of what is not a ground, only colours the style sheets have', () => {
    for (const k of [...Object.keys(NOT_GROUNDS), ...Object.keys(DEEP_FILLS)])
      expect(isColour(resolved('light', k)), k).toBe(true)
    for (const k of Object.keys(DEEP_FILLS)) expect(grounds('light'), k).toContain(k)
  })

  it('writes in the placeholder’s ink only where PLACEHOLDER_INK says what it is drawn on', () => {
    const found = placeholderRules()
    expect(found.length).toBeGreaterThan(5)
    expect(
      found.filter((r) => !(r in PLACEHOLDER_INK)),
      'not named in PLACEHOLDER_INK',
    ).toEqual([])
    expect(
      Object.keys(PLACEHOLDER_INK).filter((r) => !found.includes(r)),
      'named in PLACEHOLDER_INK, written nowhere',
    ).toEqual([])
    for (const g of PLACEHOLDER_GROUNDS) expect(grounds('light'), g).toContain(g)
  })

  it('measures contrast as WCAG does', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
    expect(+contrast('#5a5d68', '#fbf8f2').toFixed(2)).toBe(6.19)
  })
})
