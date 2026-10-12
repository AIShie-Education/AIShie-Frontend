import { describe, expect, it } from 'vitest'
import mainCss from './main.css?raw'
import tokensCss from './tokens.css?raw'
import elementCss from './element.css?raw'
import appTagVue from '../components/AppTag.vue?raw'
import { AUTONOMY_LEVELS, type AutonomyLevel } from '@/api/types'

// A level of autonomy's tag (main.css, `.el-tag.app-level-tag.is-<level>`;
// docs/CONVENTIONS.md, "Colour"), read from the style sheets as they are
// written, in the light theme (:root) and the dark one (html.dark over it).
// A level is a label: it is read, never pressed, so no level lies on a
// solid ground, which is a button's (design wave 3 first drew autonomous,
// 「即時回覆」, in solid ink, the most button-like thing in the course's
// agents page's rows of text buttons). Autonomous is drawn as an attribute's
// outline is (AppTag's `outline`): no ground, the faint line. Each level
// still has a look of its own, by its ground, its edge and its words'
// colour, besides its mark (LevelIcon), and its words read at AA on
// whatever it lies on.

/** Each rule `selector { … }` of a style sheet at its top level, comments taken out. */
function rules(css: string): [string, string][] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: [string, string][] = []
  let depth = 0
  let start = 0
  let selector = ''
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) {
        selector = text.slice(start, i).trim().replace(/\s+/g, ' ')
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

/** What every rule of these sheets with exactly this selector declares, later rules over earlier ones. */
function declared(selector: string, ...sheets: string[]): Record<string, string> {
  return Object.assign(
    {},
    ...sheets.flatMap((css) =>
      rules(css)
        .filter(([s]) => s === selector)
        .map(([, body]) => declarations(body)),
    ),
  )
}

const ROOT = declared(':root', tokensCss, elementCss)
const THEMES = { light: ROOT, dark: { ...ROOT, ...declared('html.dark', tokensCss, elementCss) } } as const
type Theme = keyof typeof THEMES

/** A value as a theme paints it: a token followed to its colour ('#rrggbb'), or 'transparent'. */
function paint(theme: Theme, value: string | undefined): string {
  let v = value
  for (let hops = 0; v?.startsWith('var('); hops++) {
    if (hops > 10) throw new Error(`${value} refers to itself`)
    v = THEMES[theme][/^var\(--([a-z0-9-]+)/.exec(v)![1]]
  }
  if (v === 'transparent') return v
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${value} is not a colour in the ${theme} theme: ${v}`)
  return v.toLowerCase()
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** The base rule every level's tag takes, and each level's own over it. */
const BASE = declared('.el-tag.app-level-tag', mainCss)
const OWN = Object.fromEntries(
  AUTONOMY_LEVELS.map((l) => [l, declared(`.el-tag.app-level-tag.is-${l}`, mainCss)]),
) as Record<AutonomyLevel, Record<string, string>>

/** A level's tag as a theme paints it: its ground, its edge and its words. */
function look(theme: Theme, level: AutonomyLevel) {
  const d = { ...BASE, ...OWN[level] }
  return {
    ground: paint(theme, d['el-tag-bg-color']),
    edge: paint(theme, d['el-tag-border-color']),
    words: paint(theme, d['el-tag-text-color']),
  }
}

/** The surfaces a level's tag lies on: the page, a card, the side bar's paper, what floats (the chat's agent picker, a dialog), a field. */
const SURFACES = ['app-page', 'app-card', 'app-ground', 'app-overlay', 'app-field'] as const

describe('a level of autonomy’s tag', () => {
  it('sets its ground, its edge and its words for every level, in the style sheet', () => {
    for (const l of AUTONOMY_LEVELS) {
      expect(OWN[l]['el-tag-bg-color'], l).toBeDefined()
      expect(OWN[l]['el-tag-text-color'], l).toBeDefined()
    }
    expect(BASE['el-tag-border-color']).toBe('transparent')
  })

  for (const theme of ['light', 'dark'] as const) {
    it(`lies on no solid ground, a button's: no ground, or a tint a step from the page, ${theme}`, () => {
      for (const l of AUTONOMY_LEVELS) {
        const { ground } = look(theme, l)
        if (ground === 'transparent') continue
        for (const s of SURFACES)
          expect(contrast(ground, paint(theme, `var(--${s})`)), `${l} on --${s}`).toBeLessThan(1.5)
      }
    })

    it(`draws each level apart from the others, by its ground, its edge or its words, ${theme}`, () => {
      const looks = AUTONOMY_LEVELS.map((l) => JSON.stringify(look(theme, l)))
      expect(new Set(looks).size).toBe(AUTONOMY_LEVELS.length)
    })

    it(`writes each level's words at AA on whatever it lies on, ${theme}`, () => {
      for (const l of AUTONOMY_LEVELS) {
        const { ground, words } = look(theme, l)
        const under = ground === 'transparent' ? SURFACES.map((s) => paint(theme, `var(--${s})`)) : [ground]
        for (const g of under) expect(contrast(words, g), `${l}: ${words} on ${g}`).toBeGreaterThanOrEqual(4.5)
      }
    })
  }

  it('draws autonomous as an attribute’s outline is: no ground, the same faint line, the words in the ink', () => {
    const outline = declared(
      '.el-tag.app-tag--outline',
      appTagVue.replace(/^[\s\S]*<style[^>]*>|<\/style>[\s\S]*$/g, ''),
    )
    expect(outline['el-tag-border-color']).toBeDefined()
    expect(OWN.autonomous['el-tag-bg-color']).toBe('transparent')
    expect(OWN.autonomous['el-tag-border-color']).toBe(outline['el-tag-border-color'])
    expect(OWN.autonomous['el-tag-text-color']).toBe('var(--app-ink)')
  })

  it('keeps pending_review’s line in the ink, a step heavier than autonomous’s faint one', () => {
    for (const theme of ['light', 'dark'] as const) {
      const page = paint(theme, 'var(--app-page)')
      const review = look(theme, 'pending_review').edge
      const free = look(theme, 'autonomous').edge
      expect(contrast(review, page), theme).toBeGreaterThan(contrast(free, page))
    }
  })
})
