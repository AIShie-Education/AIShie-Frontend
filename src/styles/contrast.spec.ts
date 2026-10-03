import { describe, expect, it } from 'vitest'

// The palette's promises (styles/tokens.css), checked on the values as they
// are written, in the light theme (:root) and the dark one (html.dark over
// it): every pairing of text and the ground it is drawn on meets WCAG AA,
// 4.5:1, and a control's edge and the focus ring 3:1; the three inks are
// three steps, not two; each pill's colour is a hue of its own; and every
// colour is used and decided for the dark theme too. Element Plus's grounds
// (styles/element.css) are read beside them: a row or an option it lays
// under the app's text on hover is a ground that text must read on as well.

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
const tokensCss = fs.readFileSync(`${here}/tokens.css`, 'utf8')
const elementCss = fs.readFileSync(`${here}/element.css`, 'utf8')

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

/** A custom property's colour in a theme, var() followed; '#rrggbb'. */
function colour(theme: Theme, name: string): string {
  const props = THEMES[theme]
  let value = props[name]
  for (let hops = 0; value?.startsWith('var('); hops++) {
    if (hops > 10) throw new Error(`--${name} refers to itself`)
    value = props[/^var\(--([a-z0-9-]+)/.exec(value)![1]]
  }
  if (!value || !/^#[0-9a-f]{6}$/i.test(value))
    throw new Error(`--${name} is not a colour in the ${theme} theme: ${value}`)
  return value.toLowerCase()
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

/** The grounds text is drawn on: the page, its second shade, a card, what floats (a popover, the chat's window), a field. */
const GROUNDS = ['app-ground', 'app-ground-2', 'app-card', 'app-overlay', 'app-field']
/** What Element Plus and the app lay under text: a hovered row or option, a chosen item, a step of the ground's fill. */
const FILLS = [
  'el-fill-color-lighter',
  'el-fill-color-light',
  'el-fill-color',
  'el-color-primary-light-9',
  'app-indigo-tint',
]
/** The pills, each its text on its ground. */
const PILLS = ['wait', 'done', 'danger', 'neutral']

type Pair = [fg: string, bg: string, min: number]
function pairs(): Pair[] {
  const out: Pair[] = []
  // The three inks, on every ground, every fill, and every pill's ground (a line of meta text in an amber row).
  for (const ink of ['app-ink', 'app-ink-2', 'app-ink-3'])
    for (const bg of [...GROUNDS, ...FILLS, ...PILLS.map((p) => `app-${p}-bg`)]) out.push([ink, bg, 4.5])
  // The placeholder's ink, in a field, and where the app writes its quietest text with it: a card, the page, a popover, the lightest fill.
  for (const bg of ['app-field', 'app-card', 'app-overlay', 'app-ground', 'el-fill-color-lighter'])
    out.push(['app-ink-placeholder', bg, 4.5])
  // A pill's text on its ground, and outlined (plain) on whatever it lies on.
  for (const p of PILLS) for (const bg of [`app-${p}-bg`, ...GROUNDS]) out.push([`app-${p}-fg`, bg, 4.5])
  // The indigo: a link, the chosen tab, on any ground and on its tint; and what is written on it, a primary button, hovered too.
  for (const bg of [...GROUNDS, 'app-indigo-tint']) out.push(['app-indigo', bg, 4.5])
  out.push(['app-on-indigo', 'app-indigo', 4.5], ['app-on-indigo', 'app-indigo-dark', 4.5])
  // A control's edge, on a card, the page or a popover, and the focus ring around anything: 3:1.
  for (const bg of ['app-ground', 'app-card', 'app-overlay']) out.push(['app-control-border', bg, 3])
  for (const bg of GROUNDS) out.push(['app-focus', bg, 3])
  return out
}

describe.each(['light', 'dark'] as const)('the %s theme', (theme) => {
  it.each(pairs())('--%s on --%s reads at %s:1 or more', (fg, bg, min) => {
    // Not rounded: 4.495:1 is under 4.5.
    const ratio = contrast(colour(theme, fg), colour(theme, bg))
    expect(ratio, `${colour(theme, fg)} on ${colour(theme, bg)}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min)
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

  it('gives each pill with a hue a hue of its own, 30° apart at least, so that none is taken for another', () => {
    const hued = PILLS.map((p) => [p, chromaHue(colour(theme, `app-${p}-fg`))] as const).filter(
      ([, c]) => c.chroma > 15,
    )
    expect(hued.map(([p]) => p)).toEqual(['wait', 'done', 'danger'])
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
  })

  it('decides every colour for the dark theme too', () => {
    expect(colours.filter((k) => !(k in DARK))).toEqual([])
  })

  it('has no colour nobody paints with', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of fs.readdirSync(dir)) {
        const path = `${dir}/${name}`
        if (fs.statSync(path).isDirectory()) walk(path)
        else if (/\.(vue|ts|css)$/.test(name) && !name.endsWith('.spec.ts') && path !== `${here}/tokens.css`)
          files.push(path)
      }
    }
    walk(here.replace(/\/styles$/, ''))
    const all = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
    expect(files.length).toBeGreaterThan(100)
    expect(colours.filter((k) => !new RegExp(`var\\(--${k}[,)\\s]`).test(all))).toEqual([])
  })

  it('measures contrast as WCAG does', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
    expect(+contrast('#5a5d68', '#fbf8f2').toFixed(2)).toBe(6.19)
  })
})
